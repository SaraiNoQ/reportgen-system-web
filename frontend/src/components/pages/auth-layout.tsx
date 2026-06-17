import Image from "next/image";
import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

type AuthLayoutProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  activeStep: "login" | "recover";
  children: ReactNode;
};

const flowMarks = ["login", "workspace", "recover"] as const;

export function AuthLayout({ eyebrow, title, subtitle, activeStep, children }: AuthLayoutProps) {
  return (
    <main className="relative min-h-screen overflow-hidden bg-parchment-cream px-5 py-8 text-ink-black sm:px-8 lg:px-10">
      <div className="absolute left-8 top-8 z-10 h-8 w-[136px]">
        <Image
          src="/logo-horizontal-cn.png"
          alt="智能检测报告生成系统"
          fill
          className="object-contain object-left"
          priority
        />
      </div>
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:48px_48px]" />
      <div className="pointer-events-none absolute -left-28 top-24 h-72 w-72 rounded-full bg-mint-wash/40 blur-3xl auth-drift" />
      <div className="pointer-events-none absolute -right-20 bottom-10 h-80 w-80 rounded-full bg-peach-wash/30 blur-3xl auth-drift auth-drift-delay" />

      <div className="relative mx-auto grid min-h-[calc(100vh-64px)] w-full max-w-6xl items-center gap-10 lg:grid-cols-[minmax(0,1fr)_410px]">
        <section className="max-w-3xl auth-reveal">
          <div className="mb-7 inline-flex items-center gap-2 rounded-full border border-ink-black/25 bg-parchment-cream/80 px-4 py-2 text-xs uppercase text-graphite shadow-editorial">
            <Sparkles className="size-3.5" />
            {eyebrow}
          </div>

          <h1 className="serif max-w-2xl text-[42px] leading-[1.08] sm:text-[52px] lg:text-[60px]">
            {title}
          </h1>
          <p className="mt-5 max-w-xl text-sm leading-7 text-graphite sm:text-base">{subtitle}</p>

          <div className="mt-10 max-w-xl" aria-hidden="true">
            <div className="relative h-36 overflow-hidden rounded-[40px] border border-ink-black/15 bg-lavender-mist/45 shadow-editorial">
              <div className="absolute inset-0 bg-[linear-gradient(rgba(0,0,0,0.035)_1px,transparent_1px),linear-gradient(90deg,rgba(0,0,0,0.035)_1px,transparent_1px)] bg-[size:32px_32px]" />
              <div className="absolute left-8 right-8 top-1/2 h-px bg-ink-black/20" />
              <div className="auth-flow-runner absolute top-1/2 h-px w-24 bg-ink-black" />

              {flowMarks.map((mark, index) => {
                const selected = mark === activeStep;
                return (
                  <span
                    key={mark}
                    className={cn(
                      "absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rotate-45 border transition-colors duration-500",
                      selected ? "border-ink-black bg-parchment-cream" : "border-ink-black/25 bg-parchment-cream/60"
                    )}
                    style={{ left: `${20 + index * 30}%` }}
                  />
                );
              })}

              <div className="absolute inset-x-10 bottom-8 grid grid-cols-3 gap-8">
                {flowMarks.map((mark, index) => {
                  const selected = mark === activeStep;
                  return (
                    <span
                      key={mark}
                      className={cn(
                        "auth-meter h-1 rounded-full bg-ink-black/20",
                        selected && "bg-ink-black/70"
                      )}
                      style={{ animationDelay: `${index * 180}ms` }}
                    />
                  );
                })}
              </div>

              <div className="absolute right-8 top-8 grid grid-cols-4 gap-2">
                {Array.from({ length: 12 }, (_, index) => `pixel-${index}`).map((pixel, index) => (
                  <span
                    key={pixel}
                    className="auth-pixel size-1.5 bg-ink-black/25"
                    style={{ animationDelay: `${index * 70}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        </section>

        <section className="auth-reveal auth-reveal-delay">{children}</section>
      </div>
    </main>
  );
}
