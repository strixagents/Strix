"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./Logo";
import { NetworkBadge } from "./market-ui";
import { SearchButton } from "./QuickSearch";

export const APP_NAV = [
  { href: "/agent", label: "Agent" },
  { href: "/app", label: "Analyst" },
  { href: "/screener", label: "Screener" },
  { href: "/stocks", label: "Stocks" },
  { href: "/wallet", label: "Wallet" },
  { href: "/smart-money", label: "Smart money" },
  { href: "/launches", label: "Launches" },
  { href: "/bubbles", label: "Bubble Map" },
  { href: "/radar", label: "Rug Radar" },
  { href: "/docs", label: "Docs" },
  { href: "/download", label: "App" },
];

export function AppNav({ className = "" }: { className?: string }) {
  const path = usePathname();
  return (
    <nav className={`flex gap-1 text-sm ${className}`}>
      {APP_NAV.map((n) =>
        path === n.href ? (
          <span key={n.href} className="shrink-0 whitespace-nowrap rounded-lg bg-white/[0.06] px-2.5 py-1.5 text-white">{n.label}</span>
        ) : (
          <Link key={n.href} href={n.href} className="shrink-0 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-muted transition hover:text-white">{n.label}</Link>
        )
      )}
    </nav>
  );
}

/** Header for the Stocks and Wallet pages. */
export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/90 backdrop-blur-xl">
      <div className="flex items-center gap-3 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold">
          <Logo className="h-6 w-6" mono /> <span className="hidden sm:inline">Strix</span>
        </Link>
        <AppNav className="hidden sm:flex" />
        <div className="ml-auto flex items-center gap-2">
          <SearchButton />
          <Link href="/me" className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl border border-white/10 bg-white/[0.04] px-3 py-1.5 text-sm text-zinc-300 transition hover:text-white" aria-label="My Strix">★<span className="hidden sm:inline">My Strix</span></Link>
          <span className="hidden 2xl:inline"><NetworkBadge /></span>
        </div>
      </div>
      <AppNav className="overflow-x-auto px-3 pb-2 sm:hidden" />
    </header>
  );
}
