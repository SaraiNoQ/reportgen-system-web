import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function DataTable({
  headers,
  children,
  className,
  columns
}: {
  headers: string[];
  children: ReactNode;
  className?: string;
  columns?: string[];
}) {
  return (
    <div className={cn("table-scroll rounded-lg border border-ink-black/15", className)} style={columns ? { overflowX: "hidden" } : undefined}>
      <table
        className={cn("w-full border-collapse text-sm", columns ? "text-center" : "text-left")}
        style={columns ? { tableLayout: "fixed", textAlign: "center" } : undefined}
      >
        {columns ? (
          <colgroup>
            {columns.map((width, index) => (
              <col key={`${width}-${index}`} style={{ width }} />
            ))}
          </colgroup>
        ) : null}
        <thead className="bg-ink-black text-parchment-cream">
          <tr>
            {headers.map((header) => (
              <th key={header} className="px-3 py-2 font-medium text-center">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className }: { children: ReactNode; className?: string }) {
  return <td className={cn("border-t border-ink-black/10 px-3 py-2 align-middle", className)}>{children}</td>;
}
