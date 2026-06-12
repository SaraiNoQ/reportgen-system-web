"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Select } from "@/components/ui/forms";
import { cn } from "@/lib/utils";

type PaginationProps = {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
  pageSizeOptions?: number[];
  className?: string;
};

function pageItems(current: number, totalPages: number) {
  const pages = new Set([1, totalPages, current - 1, current, current + 1].filter((page) => page >= 1 && page <= totalPages));
  const sorted = [...pages].sort((a, b) => a - b);

  return sorted.reduce<(number | "gap")[]>((items, page, index) => {
    const previous = sorted[index - 1];
    if (previous && page - previous > 1) items.push("gap");
    items.push(page);
    return items;
  }, []);
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = [5, 10, 20, 50],
  className
}: PaginationProps) {
  const normalizedPageSize = Math.max(1, pageSize);
  const totalPages = Math.max(1, Math.ceil(total / normalizedPageSize));
  const safePage = Math.min(Math.max(page, 1), totalPages);
  const start = total === 0 ? 0 : (safePage - 1) * normalizedPageSize + 1;
  const end = Math.min(total, safePage * normalizedPageSize);

  return (
    <div className={cn("flex flex-wrap items-center justify-between gap-3 border-t border-ink-black/10 pt-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-graphite">
          共 {total} 条记录，当前 {start}-{end}
        </p>
        {onPageSizeChange ? (
          <label className="flex items-center gap-2 text-sm text-graphite">
            <span>每页</span>
            <Select
              value={String(normalizedPageSize)}
              onChange={(event) => {
                onPageSizeChange(Number(event.target.value));
                onPageChange(1);
              }}
              className="min-w-[92px]"
              aria-label="每页记录数"
            >
              {pageSizeOptions.map((option) => (
                <option key={option} value={option}>
                  {option} 条
                </option>
              ))}
            </Select>
          </label>
        ) : null}
      </div>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-ink-black/25 text-ink-black transition hover:border-ink-black hover:bg-ink-black hover:text-parchment-cream disabled:pointer-events-none disabled:opacity-35"
          disabled={safePage <= 1}
          onClick={() => onPageChange(safePage - 1)}
          aria-label="上一页"
        >
          <ChevronLeft className="size-4" />
        </button>
        {pageItems(safePage, totalPages).map((item, index) =>
          item === "gap" ? (
            <span key={`gap-${index}`} className="px-1 text-sm text-warm-stone">
              ...
            </span>
          ) : (
            <button
              key={item}
              type="button"
              className={cn(
                "focus-ring inline-flex h-8 min-w-8 items-center justify-center rounded-md border px-2 text-sm transition",
                item === safePage
                  ? "border-ink-black bg-ink-black text-parchment-cream"
                  : "border-ink-black/25 text-ink-black hover:border-ink-black hover:bg-parchment-cream/70"
              )}
              onClick={() => onPageChange(item)}
              aria-current={item === safePage ? "page" : undefined}
            >
              {item}
            </button>
          )
        )}
        <button
          type="button"
          className="focus-ring inline-flex size-8 items-center justify-center rounded-md border border-ink-black/25 text-ink-black transition hover:border-ink-black hover:bg-ink-black hover:text-parchment-cream disabled:pointer-events-none disabled:opacity-35"
          disabled={safePage >= totalPages}
          onClick={() => onPageChange(safePage + 1)}
          aria-label="下一页"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}
