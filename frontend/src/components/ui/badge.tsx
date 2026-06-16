import { cn } from "@/lib/utils";

const toneClass = {
  neutral: "border-ink-black/30 text-graphite",
  success: "border-ink-black/30 text-ink-black bg-[#dff5e5]",
  warning: "border-ink-black/30 text-ink-black bg-[#f4e3bd]",
  danger: "border-ink-black/30 text-ink-black bg-[#f7d7d4]",
  active: "border-ink-black/30 text-ink-black bg-lavender-mist"
};

export function Badge({
  children,
  tone = "neutral",
  className
}: {
  children: React.ReactNode;
  tone?: keyof typeof toneClass;
  className?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs", toneClass[tone], className)}>
      {children}
    </span>
  );
}

export function StatusDot({ tone = "neutral" }: { tone?: keyof typeof toneClass }) {
  return (
    <span
      className={cn(
        "size-2 rounded-full bg-warm-stone",
        tone === "success" && "bg-[#229954]",
        tone === "warning" && "bg-[#b97400]",
        tone === "danger" && "bg-[#b91c1c]",
        tone === "active" && "bg-ink-black"
      )}
    />
  );
}
