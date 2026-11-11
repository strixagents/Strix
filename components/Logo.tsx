/**
 * Strix mark: two rounded squares overlapping — amber and violet, with the shared area lit
 * where they meet (two signals combining: the agent and the chain).
 * `mono` is kept for older call sites; the mark is always shown in brand colour.
 */
export function Logo({ className = "h-7 w-7" }: { className?: string; mono?: boolean }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true">
      <defs>
        <clipPath id="strix-logo-a">
          <rect x="3" y="4" width="16.5" height="16.5" rx="4.6" />
        </clipPath>
      </defs>
      <rect x="3" y="4" width="16.5" height="16.5" rx="4.6" fill="#ff9f43" />
      <rect x="12.5" y="11.5" width="16.5" height="16.5" rx="4.6" fill="#7c5cff" />
      <rect x="12.5" y="11.5" width="16.5" height="16.5" rx="4.6" fill="#ffc2ff" clipPath="url(#strix-logo-a)" />
    </svg>
  );
}
