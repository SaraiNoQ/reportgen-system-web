"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowRight, Eye, EyeOff, LockKeyhole, UserRound } from "lucide-react";
import { AuthLayout } from "@/components/pages/auth-layout";
import { useAppContext } from "@/components/providers/app-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/forms";
import { authApi } from "@/lib/services/api";

export default function LoginPage() {
  const router = useRouter();
  const { login } = useAppContext();
  const [username, setUsername] = useState("zhanggong");
  const [password, setPassword] = useState("password123");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleLogin() {
    setSubmitting(true);
    setError("");
    try {
      const session = await authApi.login(username, password);
      login(session);
      router.push("/projects");
    } catch {
      setError("登录失败，请检查 Core API 或账号信息。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="报告系统"
      title="检测报告系统"
      subtitle="内部工作台入口。完成身份确认后即可进入报告编制流程。"
      activeStep="login"
    >
      <Card className="rounded-[40px] border-ink-black/20 bg-parchment-cream/90 p-6 shadow-editorial backdrop-blur md:p-7">
        <div className="mb-7">
          <p className="text-xs uppercase text-warm-stone">Login</p>
          <h2 className="serif mt-3 text-4xl leading-tight">进入系统</h2>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm text-graphite">账号</span>
            <div className="relative">
              <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
              <Input
                className="h-12 w-full rounded-full border-ink-black/25 bg-parchment-cream pl-11 pr-4 text-[15px]"
                value={username}
                autoComplete="username"
                disabled={submitting}
                onChange={(event) => setUsername(event.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-graphite">密码</span>
            <div className="relative">
              <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
              <Input
                className="h-12 w-full rounded-full border-ink-black/25 bg-parchment-cream pl-11 pr-12 text-[15px]"
                type={showPassword ? "text" : "password"}
                value={password}
                autoComplete="current-password"
                disabled={submitting}
                onChange={(event) => setPassword(event.target.value)}
              />
              <button
                type="button"
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                title={showPassword ? "隐藏密码" : "显示密码"}
                className="focus-ring absolute right-2 top-1/2 grid size-8 -translate-y-1/2 place-items-center rounded-full text-graphite transition hover:bg-lavender-mist hover:text-ink-black"
                disabled={submitting}
                onClick={() => setShowPassword((next) => !next)}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </label>

          <div className="flex items-center justify-between gap-4 text-sm text-graphite">
            <label className="flex min-w-0 items-center gap-2">
              <input type="checkbox" defaultChecked className="size-4 accent-charcoal" />
              <span>记住账号</span>
            </label>
            <Link className="shrink-0 underline decoration-ink-black/25 underline-offset-4 hover:text-ink-black" href="/forgot-password">
              忘记密码
            </Link>
          </div>
        </div>

        {error ? (
          <p className="mt-5 rounded-[18px] border border-ink-black/20 bg-lavender-mist/60 px-4 py-3 text-sm text-graphite">
            {error}
          </p>
        ) : null}

        <Button className="mt-7 h-12 w-full rounded-full text-[15px]" variant="primary" onClick={handleLogin} loading={submitting} loadingText="登录中...">
          登录
          <ArrowRight className="size-4" />
        </Button>

      </Card>
    </AuthLayout>
  );
}
