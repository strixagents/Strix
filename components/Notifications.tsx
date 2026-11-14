"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { store } from "./store";
import { useInstall } from "./InstallApp";

/**
 * Push notifications: the browser subscribes with Strix's public VAPID key, and the server
 * is told which price alerts to watch. Alerts and the Rug Radar preference stay in sync
 * whenever they change, and every app open re-registers (so a server restart loses nothing).
 */

const RADAR_KEY = "strix.push.radar";
const readRadar = () => {
  try {
    return localStorage.getItem(RADAR_KEY) !== "0";
  } catch {
    return true;
  }
};
const supported = () => typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;

function keyBytes(b64u: string) {
  const s = (b64u + "=".repeat((4 - (b64u.length % 4)) % 4)).replace(/-/g, "+").replace(/_/g, "/");
  return Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
}
async function currentSub() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/");
  return (await reg?.pushManager.getSubscription()) ?? null;
}
async function post(action: string, sub: PushSubscription, extra: Record<string, unknown> = {}) {
  const res = await fetch("/api/push", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, sub: sub.toJSON(), ...extra }) });
  const j = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(j.error || `Request failed (${res.status})`);
  return j;
}
const LAST_KEY = "strix.push.last";
const BRIEF_KEY = "strix.push.brief";
const readBrief = () => {
  try {
    return localStorage.getItem(BRIEF_KEY) !== "0";
  } catch {
    return true;
  }
};
const payload = () => ({ alerts: store.alerts(), radar: readRadar(), brief: readBrief(), watch: store.watch().map((w) => ({ pool: w.pool, symbol: w.symbol })) });
/** Register with the server — skipped when nothing changed since a sync less than 30 minutes ago. */
async function register(sub: PushSubscription, force = false) {
  const body = payload();
  const hash = JSON.stringify([sub.endpoint, body.radar, body.brief, body.watch.map((w) => w.pool), body.alerts.map((a) => [a.id, a.price, a.dir])]);
  let last: { h?: string; at?: number } = {};
  try {
    last = JSON.parse(localStorage.getItem(LAST_KEY) || "{}");
  } catch {}
  if (!force && last.h === hash && Date.now() - (last.at ?? 0) < 30 * 60_000) return;
  await post("subscribe", sub, body);
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ h: hash, at: Date.now() }));
  } catch {}
}

/** Mounted once in the layout: registers when alerts or settings change, and refreshes every 30 minutes. */
export function PushSync() {
  useEffect(() => {
    let t: ReturnType<typeof setTimeout> | undefined;
    const sync = () => {
      clearTimeout(t);
      t = setTimeout(async () => {
        const sub = await currentSub().catch(() => null);
        if (!sub || Notification.permission !== "granted") return;
        // the first sync of each visit always registers, so a server restart never loses this device for long
        let first = false;
        try {
          first = !sessionStorage.getItem("strix.push.session");
          sessionStorage.setItem("strix.push.session", "1");
        } catch {}
        register(sub, first).catch(() => {});
      }, 500);
    };
    sync();
    const onStore = (e: Event) => ["alerts", "watch"].includes((e as CustomEvent).detail) && sync();
    window.addEventListener("strix:store", onStore);
    window.addEventListener("strix:push-radar", sync);
    return () => {
      window.removeEventListener("strix:store", onStore);
      window.removeEventListener("strix:push-radar", sync);
      clearTimeout(t);
    };
  }, []);
  return null;
}

export function usePush() {
  const [state, setState] = useState<{ ready: boolean; on: boolean; radar: boolean; brief: boolean; permission: NotificationPermission | "unsupported"; available: boolean }>({ ready: false, on: false, radar: true, brief: true, permission: "default", available: false });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const cfg = (await fetch("/api/push").then((r) => r.json()).catch(() => ({ enabled: false }))) as { enabled: boolean };
    if (!supported()) return setState({ ready: true, on: false, radar: true, brief: true, permission: "unsupported", available: cfg.enabled });
    const sub = await currentSub().catch(() => null);
    setState({ ready: true, on: !!sub && Notification.permission === "granted", radar: readRadar(), brief: readBrief(), permission: Notification.permission, available: cfg.enabled });
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const enable = async () => {
    setBusy(true);
    setMsg(null);
    try {
      const cfg = (await fetch("/api/push").then((r) => r.json())) as { enabled: boolean; key: string | null };
      if (!cfg.enabled || !cfg.key) throw new Error("Notifications aren't available right now.");
      const perm = await Notification.requestPermission();
      if (perm !== "granted") throw new Error(perm === "denied" ? "Notifications are blocked — allow them for strixagents.com in your browser settings." : "Permission was not granted.");
      const reg = await navigator.serviceWorker.ready;
      const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.key) }));
      await register(sub, true);
      await post("test", sub).catch(() => {});
      setMsg("Notifications are on — a test notification is on its way.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const disable = async () => {
    setBusy(true);
    try {
      const sub = await currentSub();
      if (sub) {
        await post("unsubscribe", sub).catch(() => {});
        await sub.unsubscribe();
        try { localStorage.removeItem(LAST_KEY); } catch {}
      }
      setMsg("Notifications are off.");
    } finally {
      setBusy(false);
      refresh();
    }
  };
  const setRadar = (on: boolean) => {
    try {
      localStorage.setItem(RADAR_KEY, on ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event("strix:push-radar"));
    setState((s) => ({ ...s, radar: on }));
  };
  const setBrief = (on: boolean) => {
    try {
      localStorage.setItem(BRIEF_KEY, on ? "1" : "0");
    } catch {}
    window.dispatchEvent(new Event("strix:push-radar"));
    setState((s) => ({ ...s, brief: on }));
  };
  const sendBrief = async () => {
    const sub = await currentSub();
    if (!sub) return;
    setBusy(true);
    try {
      await register(sub, true);
      await post("brief", sub);
      setMsg("Morning brief sent — check your notifications.");
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return { ...state, busy, msg, enable, disable, setRadar, setBrief, sendBrief };
}

/** Compact card: turn notifications on/off and choose Rug Radar alerts. */
export function NotificationsCard({ compact = false }: { compact?: boolean }) {
  const p = usePush();
  const { platform } = useInstall();
  const [iosBrowser, setIosBrowser] = useState(false);
  useEffect(() => setIosBrowser(platform === "ios" && !standalone()), [platform]);
  if (!p.ready || !p.available) return null;

  return (
    <div className={`rounded-xl border ${p.on ? "border-emerald-400/25 bg-emerald-400/[0.04]" : "border-line bg-white/[0.02]"} ${compact ? "p-3" : "p-5"}`}>
      <div className="flex items-center gap-2">
        <span className={compact ? "text-sm" : "text-lg"}>🔔</span>
        <div className={`font-semibold ${compact ? "text-sm" : "text-base"}`}>Notifications</div>
        {p.on && <span className="ml-auto rounded-full border border-emerald-400/30 px-2 py-0.5 font-mono text-[10px] text-emerald-300">ON</span>}
      </div>
      <p className={`mt-1.5 text-muted ${compact ? "text-[11px]" : "text-sm"} leading-relaxed`}>
        Price alerts, serious Rug Radar events and a daily morning brief reach you even when Strix is closed.
      </p>
      {iosBrowser ? (
        <p className={`mt-3 ${compact ? "text-[11px]" : "text-sm"} text-amber`}>
          On iPhone, notifications work once Strix is installed: Safari → Share → Add to Home Screen, then open Strix from your home screen.{" "}
          <Link href="/download" className="underline underline-offset-2">How to install</Link>
        </p>
      ) : p.permission === "unsupported" ? (
        <p className={`mt-3 ${compact ? "text-[11px]" : "text-sm"} text-zinc-400`}>This browser doesn&apos;t support push notifications.</p>
      ) : (
        <>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {p.on ? (
              <button type="button" onClick={p.disable} disabled={p.busy} className="rounded-lg border border-line px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/[0.06] disabled:opacity-50">Turn off</button>
            ) : (
              <button type="button" onClick={p.enable} disabled={p.busy} className="btn-primary px-3.5 py-1.5 text-xs disabled:opacity-50">{p.busy ? "Turning on…" : "Turn on notifications"}</button>
            )}
            <label className="ml-1 flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={p.radar} onChange={(e) => p.setRadar(e.target.checked)} className="accent-amber" />
              Rug Radar alerts
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-300">
              <input type="checkbox" checked={p.brief} onChange={(e) => p.setBrief(e.target.checked)} className="accent-amber" />
              Morning brief (07:00 WIB)
            </label>
            {p.on && (
              <button type="button" onClick={p.sendBrief} disabled={p.busy} className="text-xs text-amber underline-offset-2 hover:underline disabled:opacity-50">
                Preview brief
              </button>
            )}
          </div>
          {p.msg && <p className={`mt-2 ${compact ? "text-[11px]" : "text-sm"} text-zinc-400`}>{p.msg}</p>}
        </>
      )}
    </div>
  );
}
