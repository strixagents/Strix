"use client";

import Link from "next/link";
import { useState } from "react";
import { AppHeader } from "./AppHeader";
import { useInstall, type Platform } from "./InstallApp";
import { NotificationsCard } from "./Notifications";

type Guide = { id: Platform; name: string; browsers: string; icon: React.ReactNode; steps: React.ReactNode[] };

const Apple = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M16.37 12.6c-.02-2.16 1.77-3.2 1.85-3.25-1.01-1.47-2.58-1.67-3.13-1.7-1.33-.13-2.6.79-3.28.79-.68 0-1.72-.77-2.83-.75-1.45.02-2.8.85-3.55 2.15-1.52 2.63-.39 6.52 1.09 8.66.72 1.04 1.58 2.22 2.71 2.18 1.09-.04 1.5-.7 2.82-.7 1.31 0 1.69.7 2.84.68 1.17-.02 1.91-1.06 2.63-2.11.83-1.21 1.17-2.38 1.19-2.44-.03-.01-2.28-.88-2.34-3.51zM14.2 6.25c.6-.73 1.01-1.74.9-2.75-.87.04-1.92.58-2.54 1.31-.56.64-1.05 1.67-.92 2.66.97.07 1.96-.49 2.56-1.22z" />
  </svg>
);
const Android = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M17.6 9.48l1.84-3.18a.38.38 0 00-.66-.38l-1.86 3.22a11.4 11.4 0 00-9.84 0L5.22 5.92a.38.38 0 10-.66.38L6.4 9.48A10.8 10.8 0 001 18h22a10.8 10.8 0 00-5.4-8.52zM7 15.25a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5zm10 0a1.25 1.25 0 110-2.5 1.25 1.25 0 010 2.5z" />
  </svg>
);
const Windows = (
  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="currentColor" aria-hidden>
    <path d="M3 5.5l7.5-1v7H3v-6zm0 13l7.5 1v-7H3v6zm8.5 1.1L21 21v-8.5h-9.5v7.1zm0-15.2v7.1H21V3l-9.5 1.4z" />
  </svg>
);

const GUIDES: Guide[] = [
  {
    id: "ios", name: "iPhone & iPad", browsers: "Safari", icon: Apple,
    steps: [
      <>Open <b>strixagents.com</b> in Safari.</>,
      <>Tap the <b>Share</b> button (the square with an arrow).</>,
      <>Tap <b>Add to Home Screen</b>, then <b>Add</b>. Strix appears on your home screen and opens full-screen.</>,
    ],
  },
  {
    id: "android", name: "Android", browsers: "Chrome, Edge, Samsung Internet", icon: Android,
    steps: [
      <>Tap <b>Install Strix</b> above — or open the browser menu <b>⋮</b>.</>,
      <>Choose <b>Install app</b> (or <b>Add to Home screen</b>).</>,
      <>Confirm. Strix lands in your app drawer; long-press its icon for shortcuts.</>,
    ],
  },
  {
    id: "windows", name: "Windows", browsers: "Chrome, Edge", icon: Windows,
    steps: [
      <>Click <b>Install Strix</b> above — or the install icon at the right of the address bar.</>,
      <>Confirm <b>Install</b>. Strix opens in its own window.</>,
      <>It is added to the Start menu; right-click its taskbar icon to <b>Pin to taskbar</b>.</>,
    ],
  },
  {
    id: "mac", name: "macOS", browsers: "Chrome, Edge, Brave, Safari", icon: Apple,
    steps: [
      <>Chrome, Edge or Brave: click <b>Install Strix</b> above, or the install icon in the address bar.</>,
      <>Strix is added to <b>Applications</b> and can be kept in the Dock.</>,
      <>Safari: choose <b>File → Add to Dock</b>.</>,
    ],
  },
];

const PERKS = [
  ["Its own window and icon", "Opens like any other app — no tabs, no address bar."],
  ["Always up to date", "Every Strix update reaches the app automatically. Nothing to re-install."],
  ["Straight into the agent", "Launches on the Strix agent, with shortcuts to the Analyst, Rug Radar and Wallet scanner."],
  ["Nothing to trust but the site", "No app store, no file to run. The app is strixagents.com — same live data, same privacy."],
];

export function DownloadPage() {
  const { canInstall, installed, platform, install } = useInstall();
  const [msg, setMsg] = useState<string | null>(null);

  const onInstall = async () => {
    if (canInstall) {
      const ok = await install();
      setMsg(ok ? "Installed — find Strix with your other apps." : null);
      return;
    }
    document.getElementById(`guide-${platform === "other" ? "windows" : platform}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
    setMsg(platform === "ios" ? "On iPhone and iPad, Apple only allows installing from Safari's Share menu — follow the steps below." : "Your browser doesn't offer one-click install — follow the steps for your device below.");
  };

  return (
    <div className="min-h-dvh bg-ink">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-20 pt-12 sm:pt-16">
        <section className="flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icons/icon-512.png" alt="Strix app icon" width={104} height={104} className="h-[104px] w-[104px] rounded-[26px] shadow-[0_30px_80px_-30px_#7c5cff88]" />
          <div className="mt-7 font-mono text-xs uppercase tracking-[0.22em] text-amber">Strix app</div>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-6xl">Strix on every device.</h1>
          <p className="mt-4 max-w-xl text-[17px] leading-relaxed text-zinc-400">
            Install Strix as an app on your phone or computer — its own icon and window, always up to date, straight from your browser.
          </p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {installed ? (
              <span className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/30 bg-emerald-400/10 px-5 py-3 font-medium text-emerald-300">✓ Strix is installed on this device</span>
            ) : (
              <button type="button" onClick={onInstall} className="btn-primary px-6 py-3 text-[15px]">
                {canInstall ? "Install Strix" : platform === "ios" ? "How to install on iPhone" : "Install Strix"}
              </button>
            )}
            <Link href="/agent" className="btn-secondary px-6 py-3 text-[15px]">Open in browser</Link>
          </div>
          {msg && <p className="mt-4 max-w-md text-sm text-zinc-400">{msg}</p>}
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2">
          {GUIDES.map((g) => {
            const mine = g.id === platform;
            return (
              <div key={g.id} id={`guide-${g.id}`} className={`rounded-2xl border p-6 transition ${mine ? "border-amber/40 bg-amber/[0.05]" : "border-line bg-white/[0.02]"}`}>
                <div className="flex items-center gap-3">
                  <span className="grid h-11 w-11 place-items-center rounded-xl border border-line bg-white/[0.04] text-zinc-200">{g.icon}</span>
                  <div>
                    <div className="flex items-center gap-2 text-lg font-semibold">
                      {g.name}
                      {mine && <span className="rounded-full border border-amber/40 px-2 py-0.5 font-mono text-[11px] font-normal text-amber">Your device</span>}
                    </div>
                    <div className="text-sm text-muted">{g.browsers}</div>
                  </div>
                </div>
                <ol className="mt-5 space-y-3">
                  {g.steps.map((s, i) => (
                    <li key={i} className="flex gap-3 text-[15px] leading-relaxed text-zinc-300">
                      <span className="mt-0.5 grid h-6 w-6 flex-none place-items-center rounded-full border border-line font-mono text-xs text-muted">{i + 1}</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </section>

        <section className="mx-auto mt-16 max-w-xl">
          <NotificationsCard />
        </section>

        <section className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PERKS.map(([t, d]) => (
            <div key={t} className="rounded-2xl border border-line bg-white/[0.02] p-5">
              <div className="font-semibold">{t}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
            </div>
          ))}
        </section>

        <p className="mt-10 text-center text-sm text-muted">
          Prefer the terminal? <Link href="/docs#cli" className="text-white underline-offset-2 hover:underline">Install the CLI and MCP server</Link>.
        </p>
      </main>
    </div>
  );
}
