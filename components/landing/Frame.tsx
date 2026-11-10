import type { ReactNode } from "react";

/** Product-screenshot frame with "+" corner marks and a caption below. */
export function Frame({ children, caption, className = "" }: { children: ReactNode; caption?: string; className?: string }) {
  const plus = "pointer-events-none absolute text-2xl font-light leading-none text-[#3a3a3a]";
  return (
    <div className={`frame px-3 pb-5 pt-10 sm:px-12 sm:pb-6 sm:pt-16 ${className}`}>
      <span className={`${plus} left-4 top-3`}>+</span>
      <span className={`${plus} right-4 top-3`}>+</span>
      <span className={`${plus} bottom-3 left-4`}>+</span>
      <span className={`${plus} bottom-3 right-4`}>+</span>
      <div className="relative">{children}</div>
      {caption && <p className="mt-5 text-center text-base text-muted sm:mt-6 sm:text-lg">{caption}</p>}
    </div>
  );
}

export function SectionTitle({ title, sub, center = false }: { title: ReactNode; sub?: ReactNode; center?: boolean }) {
  return (
    <div className={`mb-8 sm:mb-10 ${center ? "mx-auto max-w-2xl text-center" : "max-w-2xl"}`}>
      <h2 className="text-[2rem] font-semibold leading-[1.08] tracking-tight text-balance sm:text-5xl">{title}</h2>
      {sub && <p className={`mt-3 text-base leading-relaxed text-muted text-pretty sm:mt-4 sm:text-xl ${center ? "" : "max-w-xl"}`}>{sub}</p>}
    </div>
  );
}
