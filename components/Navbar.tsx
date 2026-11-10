"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const links = [
  { href: "/agent", label: "Agent" },
  { href: "/app", label: "Analyst" },
  { href: "/screener", label: "Screener" },
  { href: "/stocks", label: "Stocks" },
  { href: "/wallet", label: "Wallet" },
  { href: "/smart-money", label: "Smart money" },
  { href: "/radar", label: "Rug Radar" },
];

export function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header className="sticky top-0 z-50 px-3 pt-3 sm:px-6">
      <nav
        className={`mx-auto flex max-w-6xl items-center justify-between rounded-2xl border px-3 py-2.5 transition-all duration-300 sm:px-5 sm:py-3 ${
          scrolled ? "border-[#2a2a2a] bg-[#0f0f0f]/85 backdrop-blur-xl" : "border-transparent bg-transparent"
        }`}
      >
        <Link href="/" className="flex items-center gap-2.5">
          <Logo className="h-7 w-7 sm:h-8 sm:w-8" mono />
          <span className="text-xl font-medium tracking-tight sm:text-2xl">Strix</span>
        </Link>

        <ul className="hidden items-center gap-7 text-[15px] text-muted xl:flex">
          {links.map((l) => (
            <li key={l.href}>
              <Link href={l.href} className="transition-colors hover:text-white">
                {l.label}
              </Link>
            </li>
          ))}
        </ul>

        <div className="flex items-center gap-2.5">
          <Link href="/app" className="btn-secondary hidden px-4 py-2 text-[15px] sm:inline-flex">
            Analyst
          </Link>
          <Link href="/agent" className="btn-primary px-3.5 py-1.5 text-sm sm:px-4 sm:py-2 sm:text-[15px]">
            Open agent <span aria-hidden>→</span>
          </Link>
          <button
            className="ml-1 p-2 text-white xl:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2">
              {open ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </nav>

      {open && (
        <div className="mx-auto mt-2 max-w-6xl rounded-2xl border border-[#2a2a2a] bg-[#0f0f0f]/95 p-3 backdrop-blur-xl xl:hidden">
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block rounded-xl px-3 py-3 text-lg text-muted hover:bg-white/5 hover:text-white"
            >
              {l.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}
