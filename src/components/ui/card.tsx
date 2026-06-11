import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Card({
  children,
  className,
  lavender = false
}: {
  children: ReactNode;
  className?: string;
  lavender?: boolean;
}) {
  return (
    <section className={cn(lavender ? "lavender-card" : "paper-card", "p-3.5", className)}>
      {children}
    </section>
  );
}

export function SectionHeader({
  eyebrow,
  title,
  action
}: {
  eyebrow?: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-3.5 flex flex-wrap items-end justify-between gap-3">
      <div>
        {eyebrow ? <p className="mb-1.5 text-xs uppercase tracking-[0.14em] text-warm-stone">{eyebrow}</p> : null}
        <h1 className="serif text-[2.15rem] leading-tight text-ink-black">{title}</h1>
      </div>
      {action}
    </div>
  );
}
