"use client";

import { useEffect, useSyncExternalStore } from "react";

/** The browser's install prompt (Chrome, Edge, Brave, Android). Safari and Firefox don't fire it. */
type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> };
type State = { prompt: PromptEvent | null; installed: boolean };

let state: State = { prompt: null, installed: false };
const subs = new Set<() => void>();
const set = (s: Partial<State>) => {
  state = { ...state, ...s };
  subs.forEach((f) => f());
};

/** Registers the service worker and remembers the install prompt. Mounted once in the root layout. */
export function PwaRegister() {
  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).catch(() => {});
    const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) set({ installed: true });
    const onPrompt = (e: Event) => {
      e.preventDefault();
      set({ prompt: e as PromptEvent });
    };
    const onInstalled = () => set({ installed: true, prompt: null });
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);
  return null;
}

export type Platform = "ios" | "android" | "windows" | "mac" | "other";
function detectPlatform(): Platform {
  const ua = navigator.userAgent;
  if (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)) return "ios";
  if (/Android/.test(ua)) return "android";
  if (/Windows/.test(ua)) return "windows";
  if (/Macintosh|Mac OS X/.test(ua)) return "mac";
  return "other";
}

const subscribe = (f: () => void) => {
  subs.add(f);
  return () => subs.delete(f);
};

/** Install state for buttons: can the browser show its install dialog right now, and is Strix already installed? */
export function useInstall() {
  const s = useSyncExternalStore(subscribe, () => state, () => state);
  const platform = useSyncExternalStore(() => () => {}, detectPlatform, () => "other" as Platform);
  const install = async () => {
    if (!s.prompt) return false;
    await s.prompt.prompt();
    const { outcome } = await s.prompt.userChoice;
    set({ prompt: null, installed: outcome === "accepted" || state.installed });
    return outcome === "accepted";
  };
  return { canInstall: !!s.prompt, installed: s.installed, platform, install };
}
