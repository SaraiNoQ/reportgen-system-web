"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  Children,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type InputHTMLAttributes,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
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

type OptionElement = ReactElement<{
  children?: ReactNode;
  disabled?: boolean;
  value?: string | number | readonly string[];
}>;

function optionText(children: ReactNode): string {
  return Children.toArray(children)
    .map((child) => (typeof child === "string" || typeof child === "number" ? String(child) : ""))
    .join("")
    .trim();
}

function toSelectValue(value: SelectHTMLAttributes<HTMLSelectElement>["value"] | SelectHTMLAttributes<HTMLSelectElement>["defaultValue"]) {
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (value === undefined || value === null) return undefined;
  return String(value);
}

export function Select({
  className,
  children,
  value,
  defaultValue,
  onChange,
  disabled,
  name,
  id,
  required,
  title,
  "aria-label": ariaLabel,
  "aria-labelledby": ariaLabelledBy,
}: SelectHTMLAttributes<HTMLSelectElement>) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const rootRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const options = useMemo(
    () =>
      Children.toArray(children)
        .filter(isValidElement)
        .map((child) => {
          const option = child as OptionElement;
          const label = optionText(option.props.children);
          const optionValue = option.props.value === undefined ? label : String(option.props.value);

          return {
            disabled: Boolean(option.props.disabled),
            label,
            value: optionValue,
          };
        }),
    [children]
  );

  const controlledValue = toSelectValue(value);
  const fallbackValue = toSelectValue(defaultValue) ?? options[0]?.value ?? "";
  const [internalValue, setInternalValue] = useState(fallbackValue);
  const selectedValue = controlledValue ?? internalValue;
  const selectedOption = options.find((option) => option.value === selectedValue) ?? options[0];
  const activeIndex = Math.max(
    0,
    options.findIndex((option) => option.value === selectedOption?.value)
  );

  useEffect(() => {
    if (controlledValue === undefined && !options.some((option) => option.value === internalValue)) {
      setInternalValue(options[0]?.value ?? "");
    }
  }, [controlledValue, internalValue, options]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    }

    if (!open) return undefined;
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [open]);

  function emitChange(nextValue: string) {
    if (controlledValue === undefined) setInternalValue(nextValue);
    const event = {
      currentTarget: { id: selectId, name, value: nextValue },
      target: { id: selectId, name, value: nextValue },
    } as unknown as ChangeEvent<HTMLSelectElement>;
    onChange?.(event);
  }

  function choose(nextValue: string) {
    const nextOption = options.find((option) => option.value === nextValue);
    if (!nextOption || nextOption.disabled) return;
    emitChange(nextValue);
    setOpen(false);
    buttonRef.current?.focus();
  }

  function moveSelection(direction: 1 | -1) {
    if (!options.length) return;
    let nextIndex = activeIndex;
    for (let step = 0; step < options.length; step += 1) {
      nextIndex = (nextIndex + direction + options.length) % options.length;
      if (!options[nextIndex]?.disabled) {
        choose(options[nextIndex].value);
        return;
      }
    }
  }

  function handleKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (disabled) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveSelection(1);
    }
    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (!open) setOpen(true);
      moveSelection(-1);
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      setOpen((next) => !next);
    }
    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    }
  }

  return (
    <div ref={rootRef} className={cn("relative inline-block min-w-36 align-top", className)}>
      {name && !disabled ? <input type="hidden" name={name} value={selectedOption?.value ?? ""} required={required} /> : null}
      <button
        ref={buttonRef}
        id={selectId}
        type="button"
        title={title}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={ariaLabel}
        aria-labelledby={ariaLabelledBy}
        disabled={disabled}
        onClick={() => setOpen((next) => !next)}
        onKeyDown={handleKeyDown}
        className={cn(
          "focus-ring flex h-8 w-full items-center justify-between gap-3 rounded-[8px] border border-ink-black/25 bg-parchment-cream px-2.5 text-left text-sm text-ink-black shadow-none transition-[border-color,background-color,color]",
          "hover:border-ink-black hover:bg-parchment-cream/80",
          "disabled:cursor-not-allowed disabled:border-ink-black/10 disabled:text-warm-stone",
          open && "border-ink-black bg-parchment-cream"
        )}
      >
        <span className="min-w-0 truncate">{selectedOption?.label || "请选择"}</span>
        <ChevronDown className={cn("size-3.5 shrink-0 transition-transform duration-150", open && "rotate-180")} />
      </button>

      {open ? (
        <div
          role="listbox"
          aria-labelledby={selectId}
          className="absolute left-0 top-[calc(100%+6px)] z-50 max-h-64 w-full min-w-max overflow-y-auto rounded-[8px] border border-ink-black bg-parchment-cream p-1 shadow-editorial"
        >
          {options.map((option) => {
            const selected = option.value === selectedOption?.value;
            return (
              <button
                key={option.value}
                type="button"
                role="option"
                aria-selected={selected}
                disabled={option.disabled}
                onClick={() => choose(option.value)}
                className={cn(
                  "flex h-8 w-full min-w-0 items-center justify-between gap-3 rounded-[6px] px-2.5 text-left text-sm transition-colors",
                  selected ? "bg-charcoal text-parchment-cream" : "text-ink-black hover:bg-lavender-mist/70",
                  option.disabled && "cursor-not-allowed text-warm-stone opacity-60 hover:bg-transparent"
                )}
              >
                <span className="min-w-0 truncate">{option.label}</span>
                {selected ? <Check className="size-3.5 shrink-0" /> : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
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
