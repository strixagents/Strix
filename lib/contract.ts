import { cached } from "./cache";
import { rpc } from "./evm";
import { keccak256, selector } from "./keccak";
import { getStockTokens } from "./stocks";

/**
 * Contract X-ray: reads a token's deployed bytecode straight from the chain and reports which
 * admin powers it contains (mint, blacklist, pause, fee/limit setters, trading switch, upgradeable
 * proxy) and whether anyone still holds them. No source code or third-party scanner needed —
 * function selectors are pulled from the bytecode's dispatcher and matched against known signatures.
 *
 * Limits (stated in the result): selectors are matched by name, so a custom-named admin function can
 * be missed, and a matching name is a capability, not proof of abuse.
 */

export type Severity = "high" | "medium" | "info";
export type Finding = { key: string; label: string; severity: Severity; detail: string };
export type ContractScan = {
  address: string;
  isContract: boolean;
  sizeBytes: number;
  proxy: { kind: string; implementation: string; upgrader: string | null; upgradeable: boolean } | null;
  owner: { address: string; renounced: boolean; via: string } | null;
  roleBased: boolean;
  issuer: string | null;
  findings: Finding[];
  verdict: "clean" | "caution" | "danger" | "issuer";
  note: string;
  scannedAt: number;
};

export const GROUPS: { key: string; label: string; sigs: string[]; severity: Severity; what: string }[] = [
  { key: "mint", label: "Can mint new tokens", severity: "high", what: "new supply can be created and dumped on holders",
    sigs: ["mint(address,uint256)", "mint(uint256)", "mintTo(address,uint256)", "mint(address[],uint256[])", "issue(uint256)", "issue(address,uint256)", "mintFor(address,uint256)"] },
  { key: "blacklist", label: "Can blacklist wallets", severity: "high", what: "chosen wallets can be blocked from selling",
    sigs: ["blacklist(address)", "blacklistAddress(address)", "addToBlacklist(address)", "addBlacklist(address)", "setBlacklist(address,bool)", "setBlackList(address,bool)",
      "setBlacklisted(address,bool)", "blockAddress(address)", "addBots(address[])", "setBots(address[])", "setBot(address,bool)", "blockBots(address[])", "addBot(address)",
      "setIsBot(address,bool)", "addToBlackList(address[])", "manageBlacklist(address[],bool)", "freeze(address)", "freezeAccount(address,bool)", "setBlacklist(address[],bool)", "addBlackList(address)"] },
  { key: "trading", label: "Can switch trading on/off", severity: "high", what: "trading can be stopped, trapping buyers (honeypot pattern)",
    sigs: ["setTradingEnabled(bool)", "setTrading(bool)", "tradingStatus(bool)", "setTradingOpen(bool)", "pauseTrading()", "disableTrading()", "setTradingActive(bool)", "toggleTrading()"] },
  { key: "pause", label: "Can pause transfers", severity: "medium", what: "all transfers can be frozen",
    sigs: ["pause()", "setPaused(bool)", "pauseContract()"] },
  { key: "fees", label: "Can change taxes / fees", severity: "medium", what: "buy/sell tax can be raised after you buy",
    sigs: ["setFee(uint256)", "setFees(uint256,uint256)", "setFees(uint256,uint256,uint256)", "setFee(uint256,uint256)", "setTaxFee(uint256)", "setBuyFee(uint256)", "setSellFee(uint256)",
      "setTax(uint256)", "setTaxes(uint256,uint256)", "updateFees(uint256,uint256)", "setBuyTax(uint256)", "setSellTax(uint256)", "updateBuyFees(uint256,uint256,uint256)",
      "updateSellFees(uint256,uint256,uint256)", "setTransferFee(uint256)", "setMarketingFee(uint256)", "setLiquidityFee(uint256)", "setTaxFeePercent(uint256)", "setSwapFee(uint256)",
      "setBuyTaxes(uint256,uint256)", "setSellTaxes(uint256,uint256)", "updateTax(uint256,uint256)", "setTaxRates(uint256,uint256)"] },
  { key: "limits", label: "Can change wallet / tx limits", severity: "medium", what: "max-wallet or max-tx limits can be tightened to block sells",
    sigs: ["setMaxTxAmount(uint256)", "setMaxWalletSize(uint256)", "setMaxWallet(uint256)", "setMaxTx(uint256)", "updateMaxTxnAmount(uint256)", "updateMaxWalletAmount(uint256)",
      "setMaxTxPercent(uint256)", "setMaxWalletPercent(uint256)", "setMaxWalletAmount(uint256)", "setMaxTransactionAmount(uint256)"] },
];
const ROLES = ["hasRole(bytes32,address)", "grantRole(bytes32,address)"];
const UPGRADE = ["upgradeTo(address)", "upgradeToAndCall(address,bytes)"];
const ISSUER_SYMBOLS = new Set(["WETH", "USDG", "USDC", "USDT", "DAI", "PYUSD", "USD1", "USDE"]);

// EIP-1967 slots = keccak256(label) - 1, computed rather than typed by hand
const slot = (label: string) => "0x" + (BigInt("0x" + Buffer.from(keccak256(label)).toString("hex")) - 1n).toString(16).padStart(64, "0");
const SLOT_IMPL = slot("eip1967.proxy.implementation");
const SLOT_ADMIN = slot("eip1967.proxy.admin");
const SLOT_BEACON = slot("eip1967.proxy.beacon");

const isZero = (a: string | null | undefined) => !a || /^(0x)?0*$/i.test(a);
const DEAD = "0x000000000000000000000000000000000000dead";
const word2addr = (w: string | null | undefined) => (w && w.length >= 42 ? "0x" + w.slice(-40).toLowerCase() : null);
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

/** All 4-byte constants pushed in the code (PUSH4) — the function dispatcher compares calldata against these. */
function pushed4(code: string) {
  const hex = code.startsWith("0x") ? code.slice(2) : code;
  const out = new Set<string>();
  for (let i = 0; i < hex.length; ) {
    const op = parseInt(hex.slice(i, i + 2), 16);
    i += 2;
    if (op >= 0x60 && op <= 0x7f) {
      const n = op - 0x5f;
      if (n === 4) out.add(hex.slice(i, i + 8).toLowerCase());
      i += n * 2;
    }
  }
  return out;
}

const call = (to: string, sig: string) => rpc<string>("eth_call", [{ to, data: "0x" + selector(sig) }, "latest"]).catch(() => null);
const storage = (addr: string, s: string) => rpc<string>("eth_getStorageAt", [addr, s, "latest"]).catch(() => null);

/** owner()/getOwner()/admin() of `addr`, if the code exposes one. */
async function readOwner(addr: string, has: Set<string>) {
  for (const sig of ["owner()", "getOwner()", "admin()"]) {
    if (!has.has(selector(sig))) continue;
    const a = word2addr(await call(addr, sig));
    if (a) return { address: a, renounced: isZero(a) || a === DEAD, via: sig };
  }
  return null;
}

async function findProxy(addr: string, code: string) {
  const m = code.toLowerCase().match(/^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3/);
  if (m) return { kind: "minimal proxy (EIP-1167)", implementation: "0x" + m[1], admin: null as string | null };
  const impl = word2addr(await storage(addr, SLOT_IMPL));
  if (impl && !isZero(impl)) return { kind: "EIP-1967 proxy", implementation: impl, admin: word2addr(await storage(addr, SLOT_ADMIN)) };
  const beacon = word2addr(await storage(addr, SLOT_BEACON));
  if (beacon && !isZero(beacon)) {
    const bi = word2addr(await call(beacon, "implementation()"));
    if (bi && !isZero(bi)) return { kind: "beacon proxy", implementation: bi, admin: beacon };
  }
  return null;
}

/** Native ETH placeholder used by pools (0x000…000). */
const NATIVE: ContractScan = {
  address: "0x0000000000000000000000000000000000000000", isContract: false, sizeBytes: 0, proxy: null, owner: null, roleBased: false,
  issuer: "Native ETH", findings: [], verdict: "issuer", note: "Native ETH has no token contract.", scannedAt: 0,
};

export async function scanContract(address: string, symbol?: string): Promise<ContractScan> {
  const addr = address.toLowerCase();
  if (isZero(addr)) return { ...NATIVE, scannedAt: Date.now() };
  return cached(`ct2:${addr}`, 30 * 60_000, async () => {
    const code = await rpc<string>("eth_getCode", [addr, "latest"]);
    const base = { address: addr, scannedAt: Date.now(), note: "Function names are matched against known admin signatures in the bytecode; a custom-named admin function can be missed." };
    if (!code || code === "0x")
      return { ...base, isContract: false, sizeBytes: 0, proxy: null, owner: null, roleBased: false, issuer: null, findings: [], verdict: "caution" as const, note: "No contract code at this address." };

    const px = await findProxy(addr, code);
    const logic = px ? await rpc<string>("eth_getCode", [px.implementation, "latest"]).catch(() => "0x") : code;
    const has = new Set([...pushed4(code), ...pushed4(logic)]);
    const owner = await readOwner(addr, has);
    const roleBased = ROLES.some((s) => has.has(selector(s)));
    const ownerActive = owner != null && !owner.renounced;

    // who can swap the code behind a proxy?
    let proxy: ContractScan["proxy"] = null;
    if (px) {
      let upgrader: string | null = null;
      let upgradeable = false;
      if (px.admin && !isZero(px.admin)) {
        // transparent / beacon proxy: an admin address (often a ProxyAdmin contract with its own owner)
        const adminCode = await rpc<string>("eth_getCode", [px.admin, "latest"]).catch(() => "0x");
        const adminOwner = adminCode !== "0x" ? word2addr(await call(px.admin, "owner()")) : null;
        if (adminCode !== "0x" && adminOwner != null) {
          upgradeable = !isZero(adminOwner) && adminOwner !== DEAD;
          upgrader = upgradeable ? adminOwner : null;
        } else {
          upgradeable = true;
          upgrader = px.admin;
        }
      } else if (UPGRADE.some((s) => pushed4(logic).has(selector(s)))) {
        // UUPS: the upgrade function lives in the logic and is normally owner/role-gated
        upgradeable = ownerActive || roleBased;
        upgrader = ownerActive ? owner!.address : roleBased ? "admin role" : null;
      }
      proxy = { kind: px.kind, implementation: px.implementation, upgrader, upgradeable };
    }
    const controlled = ownerActive || roleBased;

    const stocks = await getStockTokens().catch(() => []);
    const isStock = stocks.some((s) => s.token.address.toLowerCase() === addr);
    const issuer = isStock ? "Official Robinhood stock token" : symbol && ISSUER_SYMBOLS.has(symbol.toUpperCase()) ? `${symbol.toUpperCase()} (issuer-managed asset)` : null;

    const findings: Finding[] = [];
    if (proxy)
      findings.push(
        proxy.upgradeable
          ? { key: "proxy", label: "Upgradeable code", severity: issuer ? "info" : "high",
              detail: `${proxy.kind}: the token logic can be replaced with new code by ${proxy.upgrader === "admin role" ? "an admin role" : short(proxy.upgrader ?? "an admin")}.` }
          : { key: "proxy", label: "Proxy with locked upgrades", severity: "info",
              detail: `${proxy.kind} pointing to ${short(proxy.implementation)}, but no active upgrader was found — the logic looks fixed.` }
      );
    for (const g of GROUPS) {
      const hit = g.sigs.find((s) => has.has(selector(s)));
      if (!hit) continue;
      findings.push({
        key: g.key,
        label: g.label,
        severity: !controlled || issuer ? "info" : g.severity,
        detail: `${hit.split("(")[0]}() is in the contract — ${g.what}.${
          controlled ? (ownerActive ? ` Owner ${short(owner!.address)} still holds it.` : " Controlled by admin roles.") : " No active owner or admin role was found, so it looks locked."
        }`,
      });
    }
    if (ownerActive && !findings.some((f) => f.severity !== "info"))
      findings.push({ key: "owner", label: "Owner active", severity: "info", detail: `Owner ${short(owner!.address)} is set, but no dangerous admin function was found.` });
    if (owner?.renounced) findings.push({ key: "renounced", label: "Ownership renounced", severity: "info", detail: "The owner is the zero/dead address — owner-only functions are locked." });
    if (!owner && !roleBased && !proxy?.upgradeable && !findings.length)
      findings.push({ key: "noadmin", label: "No admin controls found", severity: "info", detail: "No owner, admin role, upgrade path or known admin function in the bytecode." });

    const highs = findings.filter((f) => f.severity === "high").length;
    const meds = findings.filter((f) => f.severity === "medium").length;
    const verdict = issuer ? "issuer" : highs ? "danger" : meds ? "caution" : "clean";
    return {
      ...base, isContract: true, sizeBytes: (code.length - 2) / 2, proxy, owner, roleBased, issuer, findings, verdict,
      ...(issuer ? { note: `${issuer}: admin powers such as minting, pausing or upgrades are expected here — the issuer manages the asset.` } : {}),
    };
  });
}
