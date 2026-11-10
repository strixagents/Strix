"use client";

import { useEffect, useState } from "react";

/**
 * Per-browser user state shared by the agent, the analyst and the wallet page:
 * price alerts, the token watchlist and followed wallets. Stored in localStorage;
 * every change fires a `strix:store` event so all mounted views stay in sync.
 */

export type PriceAlert = { id: string; pool: string; symbol: string; price: number; dir: "above" | "below"; created: number };
export type WatchItem = { pool: string; symbol: string; added: number };
export type Followed = { address: string; label: string };

const KEYS = { alerts: "strix.rh.alerts", watch: "strix.watch", follow: "strix.follow" } as const;
type Key = keyof typeof KEYS;

function read<T>(k: Key): T[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEYS[k]) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}
function write<T>(k: Key, v: T[]) {
  try {
    localStorage.setItem(KEYS[k], JSON.stringify(v));
  } catch {}
  window.dispatchEvent(new CustomEvent("strix:store", { detail: k }));
}

export const store = {
  alerts: () => read<PriceAlert>("alerts"),
  setAlerts: (v: PriceAlert[]) => write("alerts", v),
  addAlert: (a: Omit<PriceAlert, "id" | "created">) => {
    const next = [...read<PriceAlert>("alerts"), { ...a, id: crypto.randomUUID(), created: Date.now() }];
    write("alerts", next);
    if (typeof Notification !== "undefined" && Notification.permission === "default") Notification.requestPermission().catch(() => {});
  },
  watch: () => read<WatchItem>("watch"),
  setWatch: (v: WatchItem[]) => write("watch", v),
  addWatch: (w: Omit<WatchItem, "added">) => {
    const cur = read<WatchItem>("watch");
    if (cur.some((x) => x.pool.toLowerCase() === w.pool.toLowerCase())) return;
    write("watch", [...cur, { ...w, added: Date.now() }].slice(-20));
  },
  removeWatch: (poolOrSymbol: string) => {
    const k = poolOrSymbol.toLowerCase();
    write("watch", read<WatchItem>("watch").filter((x) => x.pool.toLowerCase() !== k && x.symbol.toLowerCase() !== k));
  },
  followed: () => read<Followed>("follow"),
  setFollowed: (v: Followed[]) => write("follow", v),
  follow: (f: Followed) => {
    const cur = read<Followed>("follow");
    if (cur.some((x) => x.address.toLowerCase() === f.address.toLowerCase())) return;
    write("follow", [...cur, f].slice(-20));
  },
  unfollow: (address: string) => write("follow", read<Followed>("follow").filter((x) => x.address.toLowerCase() !== address.toLowerCase())),
};

/** Re-render when any Strix store key changes (this tab or another tab). */
export function useStore<T>(get: () => T, initial: T): T {
  const [v, setV] = useState<T>(initial);
  useEffect(() => {
    const load = () => setV(get());
    load();
    window.addEventListener("strix:store", load);
    window.addEventListener("storage", load);
    return () => {
      window.removeEventListener("strix:store", load);
      window.removeEventListener("storage", load);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return v;
}
