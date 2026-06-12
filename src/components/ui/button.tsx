import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: ButtonVariant;
  children: ReactNode;
  loading?: boolean;
  loadingText?: string;
};

export function Button({ className, variant = "secondary", children, disabled, loading = false, loadingText, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        "focus-ring inline-flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium transition",
        "disabled:pointer-events-none disabled:opacity-50",
        variant === "primary" && "border-charcoal bg-charcoal text-parchment-cream hover:bg-black",
        variant === "secondary" && "border-ink-black/70 bg-transparent text-ink-black hover:bg-ink-black hover:text-parchment-cream",
        variant === "ghost" && "border-transparent bg-transparent text-graphite hover:border-ink-black/30 hover:text-ink-black",
        variant === "danger" && "border-ink-black bg-ink-black text-parchment-cream hover:bg-charcoal",
        className
      )}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <>
          <Loader2 className="size-4 animate-spin" />
          {loadingText ?? children}
        </>
      ) : (
        children
      )}
    </button>
  );
}
