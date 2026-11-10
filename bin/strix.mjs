#!/usr/bin/env node
// Strix CLI — the Robinhood Chain AI trading agent in your terminal.
// Talks to a running Strix server (default http://localhost:3001, override with STRIX_URL).

const BASE = (process.env.STRIX_URL || "http://localhost:3001").replace(/\/$/, "");
const argv = process.argv.slice(2);
const JSON_OUT = argv.includes("--json");
const NO_COLOR = argv.includes("--no-color") || !!process.env.NO_COLOR || !process.stdout.isTTY;

/* ───────────── tiny ANSI helpers ───────────── */
const c = (code) => (s) => (NO_COLOR ? String(s) : `\x1b[${code}m${s}\x1b[0m`);
const bold = c(1), dim = c(2), red = c(31), green = c(32), yellow = c(33), cyan = c(36), gray = c(90), magenta = c(35);
const pct = (v) => (v == null || !isFinite(v) ? gray("–") : (v >= 0 ? green : red)(`${v >= 0 ? "+" : ""}${Number(v).toFixed(2)}%`));
const usd = (n) => n == null || !isFinite(n) ? "–" : n >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : n >= 1e6 ? `$${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `$${(n / 1e3).toFixed(1)}K` : `$${Number(n).toFixed(2)}`;
const price = (n) => n == null || !isFinite(n) ? "–" : n >= 1000 ? `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}` : n >= 1 ? `$${+n.toFixed(4)}` : `$${Number(n).toPrecision(4)}`;
const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "");
const pad = (s, n) => {
  const raw = String(s).replace(/\x1b\[[0-9;]*m/g, "");
  return s + " ".repeat(Math.max(0, n - raw.length));
};
const riskColor = (lvl) => (lvl === "High" ? red : lvl === "Medium" ? yellow : green)(lvl);

/* ───────────── args ───────────── */
function opt(name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : fallback;
}
const positional = argv.filter((a, i) => !a.startsWith("--") && !(i > 0 && argv[i - 1].startsWith("--") && !["--json", "--no-color"].includes(argv[i - 1])));
const [cmd, ...rest] = positional;

/* ───────────── HTTP ───────────── */
async function tool(name, args = {}) {
  let res;
  try {
    res = await fetch(`${BASE}/api/tool`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, args }) });
  } catch {
    fail(`Can't reach the Strix server at ${BASE}. Start it with:  npx next dev -p 3001`);
  }
  const j = await res.json().catch(() => ({}));
  if (!res.ok || j.error) fail(j.error || `HTTP ${res.status}`);
  return j;
}
function fail(msg) {
  console.error(red("✕ ") + msg);
  process.exit(1);
}
function spinner(label) {
  if (NO_COLOR || JSON_OUT) return { stop() {} };
  const frames = ["◐", "◓", "◑", "◒"];
  let i = 0;
  const id = setInterval(() => process.stderr.write(`\r${cyan(frames[i++ % 4])} ${dim(label)}   `), 120);
  return { stop() { clearInterval(id); process.stderr.write("\r\x1b[2K"); } };
}
async function run(label, name, args, render) {
  const sp = spinner(label);
  const r = await tool(name, args);
  sp.stop();
  if (JSON_OUT) return console.log(JSON.stringify(r.data, null, 2));
  render(r.data, r.summary);
}

/* ───────────── light markdown → terminal ───────────── */
function md(text) {
  return text
    .split("\n")
    .map((l) => {
      if (/^#{1,6}\s/.test(l)) return bold(cyan(l.replace(/^#{1,6}\s/, "")));
      if (/^\|?\s*-{3,}/.test(l)) return gray(l);
      if (/^>\s?/.test(l)) return gray("│ " + l.replace(/^>\s?/, ""));
      return l
        .replace(/\*\*(.+?)\*\*/g, (_, s) => bold(s))
        .replace(/`([^`]+)`/g, (_, s) => yellow(s))
        .replace(/\[([^\]]+)\]\((https?:[^)]+)\)/g, (_, t, u) => `${t} ${gray(u)}`)
        .replace(/^(\s*)[-*]\s/, "$1• ");
    })
    .join("\n");
}

/* ───────────── commands ───────────── */
const commands = {
  async ask() {
    const q = rest.join(" ").trim();
    if (!q) fail('Usage: strix ask "your question"');
    let res;
    try {
      res = await fetch(`${BASE}/api/agent`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: [{ role: "user", content: q }] }) });
    } catch {
      fail(`Can't reach the Strix server at ${BASE}. Start it with:  npx next dev -p 3001`);
    }
    if (!res.ok || !res.body) fail((await res.json().catch(() => ({}))).error || `HTTP ${res.status}`);
    const dec = new TextDecoder();
    let buf = "";
    let answer = "";
    for await (const chunk of res.body) {
      buf += dec.decode(chunk, { stream: true });
      const lines = buf.split("\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const e = JSON.parse(line);
        if (JSON_OUT) continue;
        if (e.t === "step") process.stderr.write(`${cyan("◐")} ${dim(e.label)}\n`);
        else if (e.t === "step_done") process.stderr.write(`  ${e.ok ? green("✓") : red("✕")} ${gray(e.summary)}\n`);
        else if (e.t === "error") process.stderr.write(`  ${yellow("!")} ${gray("AI provider busy — falling back")}\n`);
        else if (e.t === "answer") answer = e.text;
      }
    }
    if (JSON_OUT) return console.log(JSON.stringify({ answer }, null, 2));
    console.log("\n" + md(answer) + "\n");
  },

  async overview() {
    await run("Reading Robinhood Chain…", "get_chain_overview", {}, (d) => {
      console.log(bold("\nRobinhood Chain") + gray(`  chain 4663`));
      if (d.network) console.log(gray(`block ${d.network.block.toLocaleString("en-US")} · gas ${d.network.gasGwei.toFixed(4)} gwei`));
      console.log(`DEX volume 24h ${bold(usd(d.totalVolume24h))}\n`);
      const table = (title, rows) => {
        console.log(bold(title));
        for (const t of rows) console.log(`  ${pad(bold(t.symbol), 12)} ${pad(price(t.priceUsd), 14)} ${pad(pct(t.change24h), 12)} vol ${pad(usd(t.volume24h), 10)} liq ${usd(t.liquidity)}`);
        console.log();
      };
      table("Top by volume", d.topByVolume.slice(0, 10));
      table("Top gainers", d.gainers);
      table("Top losers", d.losers);
    });
  },

  async analyze() {
    const token = rest[0];
    if (!token) fail("Usage: strix analyze <token> [--interval 15m|1h|4h|1d|1w]");
    const interval = opt("interval", "1h");
    await run(`Analyzing ${token} (${interval})…`, "analyze_token", { token, interval }, (d) => {
      const ta = typeof d.technical === "object" ? d.technical : null;
      console.log(`\n${bold(d.symbol)} ${gray(d.name)}  ${bold(price(d.priceUsd))} ${pct(d.changePct.h24)} ${gray("24h")}   risk ${riskColor(d.risk.level)}`);
      console.log(gray(`${d.quote} pool · ${d.dex} · ${short(d.pool)}`));
      console.log(`\n${bold("On-chain")}`);
      console.log(`  liquidity ${usd(d.liquidityUsd)} · FDV ${usd(d.fdvUsd)} · vol 24h ${usd(d.volumeUsd.h24)} · age ${d.poolAgeHours != null ? (d.poolAgeHours / 24).toFixed(1) + "d" : "–"}`);
      console.log(`  1h ${pct(d.changePct.h1)} · 6h ${pct(d.changePct.h6)} · buys/sells ${green(d.txns24h.buys)}/${red(d.txns24h.sells)}`);
      if (d.risk.flags.length) console.log(`  ${yellow("⚠")} ${d.risk.flags.join(", ")}`);
      if (d.signals.length) console.log(`  ${cyan("◆")} ${d.signals.join(", ")}`);
      if (ta) {
        const tone = ta.score >= 15 ? green : ta.score <= -15 ? red : yellow;
        console.log(`\n${bold(`Technicals (${interval})`)}  ${tone(ta.bias)} ${gray(`score ${ta.score}`)}`);
        console.log(`  RSI ${ta.rsi?.toFixed(1)} · MACD hist ${Number(ta.macdHist ?? ta.macd?.hist).toPrecision(3)} · ATR ${ta.atrPct?.toFixed(2)}%`);
        console.log(`  EMA20 ${price(ta.ema20)} · EMA50 ${price(ta.ema50)} · EMA200 ${price(ta.ema200)}`);
        const lv = (a) => (a ?? []).map((x) => price(x.price ?? x)).join("  ") || "–";
        console.log(`  ${red("R")} ${lv(ta.resistance)}`);
        console.log(`  ${green("S")} ${lv(ta.support)}`);
        if (ta.riskPlan) {
          const p = ta.riskPlan;
          console.log(`  long  stop ${price(p.long.stop)} · TP1 ${price(p.long.tp1)} · TP2 ${price(p.long.tp2)}`);
          console.log(`  short stop ${price(p.short.stop)} · TP1 ${price(p.short.tp1)} · TP2 ${price(p.short.tp2)}`);
        }
        console.log(gray(`  ${ta.reasons.join("; ")}`));
      } else console.log(gray(`\n${d.technical}`));
      console.log(gray(`\n${d.links.geckoterminal}\n`));
    });
  },

  async safe() {
    const token = rest[0];
    if (!token) fail("Usage: strix safe <token>");
    await run(`Running safety scorecard on ${token}…`, "get_token_scorecard", { token }, (d) => {
      const s = d.scorecard;
      const g = s.grade === "A" || s.grade === "B" ? green : s.grade === "C" ? yellow : red;
      console.log(`\n${bold(d.symbol)}  ${g(bold(` ${s.grade} `))} ${bold(s.score)}${gray("/100")}  ${s.verdict}`);
      console.log(gray(`token ${d.tokenAddress}\n`));
      const icon = { pass: green("✓"), warn: yellow("!"), fail: red("✕"), info: gray("i") };
      for (const ch of s.checks) console.log(`  ${icon[ch.status]} ${pad(ch.label, 22)} ${gray(ch.detail)}`);
      console.log(gray("\nAutomated checks — not a guarantee. Always verify the contract.\n"));
    });
  },

  async whales() {
    const token = rest[0];
    if (!token) fail("Usage: strix whales <token>");
    await run(`Tracking whales on ${token}…`, "get_whale_activity", { token }, (d) => {
      const w = d.whales;
      if (!w) return console.log(gray("No whale data right now."));
      const tone = w.pressure === "Whales buying" ? green : w.pressure === "Whales selling" ? red : yellow;
      console.log(`\n${bold(d.symbol)} whales ${gray(`(24h, trades ≥ ${usd(w.thresholdUsd)})`)}  ${tone(w.pressure)}`);
      console.log(`  ${green(`${w.buys} buys ${usd(w.buysUsd)}`)}  vs  ${red(`${w.sells} sells ${usd(w.sellsUsd)}`)}  · ${w.uniqueWallets} wallets`);
      if (w.washSuspect) console.log(red(`  ⚠ ${w.topWalletSharePct}% of large trades from ONE wallet trading with itself — likely wash trading`));
      console.log(`\n${bold("Top accumulators")}`);
      for (const x of w.topAccumulators) console.log(`  ${pad(short(x.wallet), 14)} ${green("+" + usd(x.netUsd))} ${gray(`${x.trades}tx`)}`);
      console.log(`${bold("Top sellers")}`);
      for (const x of w.topSellers) console.log(`  ${pad(short(x.wallet), 14)} ${red("−" + usd(Math.abs(x.netUsd)))} ${gray(`${x.trades}tx`)}`);
      console.log(`\n${bold("Latest")}`);
      for (const t of w.latest) console.log(`  ${pad(t.kind === "buy" ? green("BUY") : red("SELL"), 6)} ${pad(usd(t.usd), 10)} ${pad(short(t.wallet), 14)} ${gray(new Date(t.time).toLocaleTimeString())}`);
      if (d.largeTransfers?.length) {
        console.log(`\n${bold("Large wallet transfers")} ${gray("(RPC, last ~hour)")}`);
        for (const t of d.largeTransfers) console.log(`  ${pad(t.kind, 9)} ${pad(usd(t.usd), 10)} ${short(t.from)} → ${short(t.to)}`);
      }
      console.log();
    });
  },

  async scan() {
    const list = opt("list", "top");
    const signal = opt("signal", undefined);
    const max_risk = opt("max-risk", undefined);
    await run(`Scanning ${list} tokens…`, "scan_tokens", { list, signal, max_risk }, (d) => {
      console.log(`\n${bold("Robinhood Chain scan")} ${gray(`${list}${signal ? ` · ${signal}` : ""} · ${d.matches.length}/${d.scanned} matched`)}\n`);
      console.log(gray(`  ${pad("TOKEN", 12)} ${pad("PRICE", 14)} ${pad("1H", 10)} ${pad("24H", 11)} ${pad("LIQ", 10)} ${pad("RISK", 8)} SIGNALS`));
      for (const t of d.matches)
        console.log(`  ${pad(bold(t.symbol), 12)} ${pad(price(t.priceUsd), 14)} ${pad(pct(t.changePct.h1), 10)} ${pad(pct(t.changePct.h24), 11)} ${pad(usd(t.liquidityUsd), 10)} ${pad(riskColor(t.risk.level), 8)} ${gray(t.signals.join(", "))}`);
      console.log();
    });
  },

  async new() {
    await run("Checking new pools…", "get_new_launches", {}, (d) => {
      console.log(`\n${bold("Newest pools on Robinhood Chain")}\n`);
      for (const t of d)
        console.log(`  ${pad(bold(t.symbol), 12)} ${pad(price(t.priceUsd), 14)} ${pad(pct(t.changePct.h24), 11)} liq ${pad(usd(t.liquidityUsd), 9)} age ${pad((t.poolAgeHours ?? 0) < 1 ? `${Math.round((t.poolAgeHours ?? 0) * 60)}m` : `${Math.round(t.poolAgeHours)}h`, 5)} ${riskColor(t.risk.level)} ${gray(t.risk.flags.join(", "))}`);
      console.log(gray("\nNew pools are the riskiest corner of any chain.\n"));
    });
  },

  async search() {
    const q = rest.join(" ");
    if (!q) fail("Usage: strix search <name or symbol>");
    await run(`Searching ${q}…`, "search_token", { query: q }, (d) => {
      console.log();
      for (const r of d) console.log(`  ${pad(bold(r.symbol), 12)} ${pad(gray(r.name ?? ""), 30)} liq ${pad(usd(r.liquidity), 10)} ${gray(r.pool)}`);
      console.log();
    });
  },

  async stocks() {
    const ticker = rest[0];
    await run("Comparing stock tokens with real shares…", "get_stock_premiums", ticker ? { ticker } : {}, (d) => {
      console.log(`\n${bold("Stock token premium")} ${gray(d.usMarketOpen ? "· US market OPEN (live)" : "· US market closed — vs last close")}\n`);
      console.log(gray(`  ${pad("TICKER", 8)} ${pad("TOKEN", 12)} ${pad("STOCK", 12)} ${pad("PREMIUM", 10)} ${pad("LIQ", 10)} NOTES`));
      for (const s of d.stocks) {
        const p = s.premiumPct;
        const prem = p == null ? gray("–") : (Math.abs(p) < 0.25 ? (x) => x : p > 0 ? green : red)(`${p >= 0 ? "+" : ""}${p.toFixed(2)}%`);
        console.log(`  ${pad(bold(s.ticker), 8)} ${pad(price(s.tokenPriceUsd), 12)} ${pad(price(s.stockPriceUsd), 12)} ${pad(prem, 10)} ${pad(usd(s.liquidityUsd), 10)} ${s.lookalikeTokens ? yellow(`${s.lookalikeTokens} lookalike(s)`) : ""}`);
      }
      console.log(gray("\nGaps can come from fees, liquidity and timing — not guaranteed arbitrage.\n"));
    });
  },

  async wallet() {
    const address = rest[0];
    if (!address) fail("Usage: strix wallet <0x… address>");
    await run(`Scanning ${short(address)}…`, "scan_wallet", { address }, (d) => {
      console.log(`\n${bold(short(d.address))}  ${bold(usd(d.portfolioUsd))}  ${gray(`· ${d.transactionsSent?.toLocaleString("en-US") ?? "?"} tx sent`)}${d.looksLikeBot ? "  " + yellow("BOT / RELAYER") : ""}`);
      if (d.highRiskUsd > 0) console.log(red(`  ⚠ ${usd(d.highRiskUsd)} sits in High-risk tokens`));
      if (d.spamTokensHidden) console.log(gray(`  ${d.spamTokensHidden} spam / fake airdrop tokens hidden`));
      console.log(`\n${bold("Holdings")}`);
      for (const h of d.holdings) console.log(`  ${pad(bold(h.symbol), 12)} ${pad(String(+Number(h.balance).toPrecision(6)), 16)} ${pad(h.valueUsd != null ? usd(h.valueUsd) : "–", 10)} ${h.risk ? riskColor(h.risk) : ""}`);
      console.log(`\n${bold("Last 24h")} ${gray(`· ${d.last24h.swaps} trades`)}`);
      for (const f of d.last24h.netFlowsUsd) console.log(`  ${pad(bold(f.symbol), 12)} ${f.netUsd >= 0 ? green(`accumulating +${usd(f.netUsd)}`) : red(`reducing −${usd(Math.abs(f.netUsd))}`)}`);
      console.log();
    });
  },

  async news() {
    const topic = rest.join(" ") || undefined;
    await run("Reading news…", "get_news", { topic }, (d) => {
      console.log(`\n${bold("Robinhood Chain news")}${topic ? gray(` · ${topic}`) : ""}\n`);
      for (const n of d) console.log(`  ${magenta("•")} ${n.title} ${gray(`— ${n.source}`)}`);
      console.log();
    });
  },

  help() {
    console.log(`
${bold("strix")} ${gray("— AI trading agent for Robinhood Chain (chain 4663)")}

${bold("Usage")}
  strix ask "<question>"            Ask the AI agent anything
  strix overview                    Chain stats, top tokens, gainers & losers
  strix analyze <token> [--interval 1h]   On-chain stats + technicals + levels
  strix safe <token>                Safety scorecard (A–F): honeypot, copycat, holders…
  strix whales <token>              Whale buys/sells, top wallets, wash-trading check
  strix scan [--list top|trending|new] [--signal momentum] [--max-risk Low]
  strix new                         Newest pools with risk flags
  strix stocks [ticker]             Stock tokens vs the real share price (premium/discount)
  strix wallet <0x…>                Wallet holdings, risk, spam filter and 24h trades
  strix search <name|symbol>        Find a token / pool
  strix news [topic]                Robinhood Chain headlines

${bold("Options")}
  --json        Raw JSON output (for scripts)
  --no-color    Plain text
  STRIX_URL     Server URL (default http://localhost:3001)

${bold("Signals")}  momentum, breakout, dip_buy, volume_spike, buy_pressure, sell_pressure, dumping, new_pool, deep_liquidity

${gray("Research only — not financial advice.")}
`);
  },
};

const aliases = { a: "analyze", s: "safe", w: "whales", o: "overview", q: "ask", "-h": "help", "--help": "help" };
const name = aliases[cmd] ?? cmd ?? "help";
const fn = commands[name];
if (!fn) {
  console.error(red(`Unknown command "${cmd}".`));
  commands.help();
  process.exit(1);
}
await fn();
