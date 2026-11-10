"use client";

import { useEffect, useState } from "react";

type Eth = {
  request: (a: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (e: string, cb: (...a: unknown[]) => void) => void;
  removeListener?: (e: string, cb: (...a: unknown[]) => void) => void;
};

const CHAIN_PARAMS = {
  chainId: "0x1237",
  chainName: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: ["https://rpc.mainnet.chain.robinhood.com"],
  blockExplorerUrls: ["https://robinhoodchain.blockscout.com"],
};

const eth = () => (typeof window !== "undefined" ? (window as unknown as { ethereum?: Eth }).ethereum : undefined);

/** Connects an injected wallet and switches it to Robinhood Chain (adds the network if missing). */
export function WalletButton({ className = "" }: { className?: string }) {
  const [addr, setAddr] = useState<string | null>(null);
  const [bal, setBal] = useState<number | null>(null);
  const [onChain, setOnChain] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = async (a: string) => {
    const w = eth();
    if (!w) return;
    const cid = (await w.request({ method: "eth_chainId" })) as string;
    setOnChain(cid?.toLowerCase() === CHAIN_PARAMS.chainId);
    if (cid?.toLowerCase() === CHAIN_PARAMS.chainId) {
      const b = (await w.request({ method: "eth_getBalance", params: [a, "latest"] })) as string;
      setBal(parseInt(b, 16) / 1e18);
    } else setBal(null);
  };

  useEffect(() => {
    const w = eth();
    if (!w) return;
    w.request({ method: "eth_accounts" })
      .then((acc) => {
        const a = (acc as string[])[0];
        if (a) {
          setAddr(a);
          refresh(a);
        }
      })
      .catch(() => {});
    const onAcc = (acc: unknown) => {
      const a = (acc as string[])[0] ?? null;
      setAddr(a);
      if (a) refresh(a);
    };
    const onChainChanged = () => addr && refresh(addr);
    w.on?.("accountsChanged", onAcc);
    w.on?.("chainChanged", onChainChanged);
    return () => {
      w.removeListener?.("accountsChanged", onAcc);
      w.removeListener?.("chainChanged", onChainChanged);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connect = async () => {
    const w = eth();
    if (!w) {
      setMsg("No wallet found — install MetaMask or Rabby");
      setTimeout(() => setMsg(null), 3500);
      return;
    }
    try {
      const acc = (await w.request({ method: "eth_requestAccounts" })) as string[];
      try {
        await w.request({ method: "wallet_switchEthereumChain", params: [{ chainId: CHAIN_PARAMS.chainId }] });
      } catch (e) {
        if ((e as { code?: number }).code === 4902 || /unrecognized|not added/i.test((e as Error).message ?? ""))
          await w.request({ method: "wallet_addEthereumChain", params: [CHAIN_PARAMS] });
        else throw e;
      }
      setAddr(acc[0]);
      await refresh(acc[0]);
    } catch (e) {
      setMsg((e as Error).message?.slice(0, 80) || "Wallet request rejected");
      setTimeout(() => setMsg(null), 3500);
    }
  };

  return (
    <div className={`relative ${className}`}>
      <button
        onClick={connect}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs transition ${
          addr && onChain ? "border-emerald-400/30 bg-emerald-400/5 text-emerald-200" : "border-line bg-white/[0.03] text-zinc-200 hover:bg-white/[0.06]"
        }`}
        title={addr && !onChain ? "Switch to Robinhood Chain" : undefined}
      >
        {addr ? (
          <>
            <span className={`h-1.5 w-1.5 rounded-full ${onChain ? "bg-emerald-400" : "bg-amber"}`} />
            <span className="font-mono">{addr.slice(0, 6)}…{addr.slice(-4)}</span>
            {onChain && bal != null ? <span className="font-mono text-muted">{bal.toFixed(4)} ETH</span> : !onChain ? <span className="text-amber">Switch</span> : null}
          </>
        ) : (
          "Connect wallet"
        )}
      </button>
      {msg && <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-line bg-panel p-2.5 text-xs text-zinc-300 shadow-xl">{msg}</div>}
    </div>
  );
}
