import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card } from "@/components/ui/card";

export function MetricCard({ label, value, change }: { label: string; value: string; change: string }) {
  const positive = change.startsWith("+");
  return (
    <Card className="min-h-24">
      <div className="flex h-full flex-col justify-between gap-4">
        <p className="text-sm text-graphite">{label}</p>
        <div>
          <p className="serif text-5xl leading-none">{value}</p>
          <p className="mt-2 flex items-center gap-1 text-xs text-warm-stone">
            {positive ? <ArrowUpRight className="size-4" /> : <ArrowDownRight className="size-4" />}
            {change}
          </p>
        </div>
      </div>
    </Card>
  );
}
