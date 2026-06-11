import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "focus-ring h-8 rounded-md border border-ink-black/20 bg-transparent px-2.5 text-sm text-ink-black placeholder:text-warm-stone",
        className
      )}
      {...props}
    />
  );
}

export function Select({ className, children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn("focus-ring h-8 rounded-md border border-ink-black/20 bg-parchment-cream px-2.5 text-sm text-ink-black", className)}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      className={cn(
        "focus-ring min-h-20 rounded-md border border-ink-black/20 bg-transparent px-2.5 py-2 text-sm text-ink-black placeholder:text-warm-stone",
        className
      )}
      {...props}
    />
  );
}
