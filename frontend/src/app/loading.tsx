import { Loader2 } from "lucide-react";

export default function Loading() {
  return (
    <main className="min-h-[calc(100vh-5rem)] px-3.5 py-4 lg:px-4">
      <div className="paper-card mx-auto max-w-6xl p-5">
        <div className="flex items-center gap-3 border-b border-ink-black/15 pb-4">
          <span className="grid size-10 place-items-center rounded-full border border-ink-black/20 bg-mint-wash/60">
            <Loader2 className="size-5 animate-spin" />
          </span>
          <div>
            <p className="text-xs uppercase tracking-[0.14em] text-warm-stone">Loading</p>
            <h1 className="serif mt-1 text-3xl leading-tight">正在加载工作台数据</h1>
          </div>
        </div>
        <div className="mt-5 grid gap-3 md:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className="h-24 rounded-lg border border-ink-black/10 bg-parchment-cream/50 p-3">
              <div className="h-3 w-20 animate-pulse rounded-full bg-ink-black/10" />
              <div className="mt-4 h-5 w-2/3 animate-pulse rounded-full bg-ink-black/10" />
              <div className="mt-3 h-2 w-full animate-pulse rounded-full bg-ink-black/10" />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
