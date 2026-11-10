export function Logo({ className = "h-7 w-7", mono = false }: { className?: string; mono?: boolean }) {
  // Abstract owl: two eyes inside a faceted head
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="strix-g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffb547" />
          <stop offset="100%" stopColor="#ff6a3d" />
        </linearGradient>
      </defs>
      <path d="M6 6 L11 9 H21 L26 6 V20 C26 25 21 28 16 28 C11 28 6 25 6 20 Z" fill={mono ? "#f2f2f2" : "url(#strix-g)"} />
      <circle cx="12" cy="16" r="3.4" fill="#0a0a0a" />
      <circle cx="20" cy="16" r="3.4" fill="#0a0a0a" />
      <circle cx="12.8" cy="15.2" r="1.1" fill="#fff" />
      <circle cx="20.8" cy="15.2" r="1.1" fill="#fff" />
      <path d="M15 20.5 L16 22.5 L17 20.5 Z" fill="#0a0a0a" />
    </svg>
  );
}
