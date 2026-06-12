"use client";

import Link from "next/link";
import { useState } from "react";
import { ArrowLeft, CheckCircle2, Mail, UserRound } from "lucide-react";
import { AuthLayout } from "@/components/pages/auth-layout";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/forms";
import { authApi } from "@/lib/services/api";

type RecoveryResult = {
  ticketId: string;
  message: string;
  expiresInMinutes: number;
};

export default function ForgotPasswordPage() {
  const [account, setAccount] = useState("zhanggong");
  const [contact, setContact] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RecoveryResult | null>(null);
  const [error, setError] = useState("");

  async function handleRecover() {
    setSubmitting(true);
    setError("");
    setResult(null);
    try {
      const response = await authApi.forgotPassword(account, contact || undefined);
      setResult(response);
    } catch {
      setError("提交失败，请确认 Core API 已启动后重试。");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      eyebrow="账号协助"
      title="找回密码"
      subtitle="提交账号信息后，系统会生成内部协助记录，管理员可据此完成密码重置或账号核验。"
      activeStep="recover"
    >
      <Card className="rounded-[40px] border-ink-black/20 bg-parchment-cream/90 p-6 shadow-editorial backdrop-blur md:p-7">
        <div className="mb-7">
          <p className="text-xs uppercase text-warm-stone">Password Help</p>
          <h2 className="serif mt-3 text-4xl leading-tight">忘记密码</h2>
        </div>

        <div className="space-y-5">
          <label className="block">
            <span className="mb-2 block text-sm text-graphite">账号或姓名</span>
            <div className="relative">
              <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
              <Input
                className="h-12 w-full rounded-full border-ink-black/25 bg-parchment-cream pl-11 pr-4 text-[15px]"
                value={account}
                autoComplete="username"
                disabled={submitting}
                onChange={(event) => setAccount(event.target.value)}
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-2 block text-sm text-graphite">联系方式</span>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
              <Input
                className="h-12 w-full rounded-full border-ink-black/25 bg-parchment-cream pl-11 pr-4 text-[15px]"
                placeholder="邮箱或手机号，可选"
                value={contact}
                autoComplete="email"
                disabled={submitting}
                onChange={(event) => setContact(event.target.value)}
              />
            </div>
          </label>
        </div>

        {result ? (
          <div className="mt-6 rounded-[24px] border border-ink-black/20 bg-lavender-mist/70 p-4 text-sm text-graphite">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-ink-black" />
              <div>
                <p className="font-medium text-ink-black">{result.message}</p>
                <p className="mt-2">协助单号：{result.ticketId}</p>
                <p className="mt-1">有效期：{result.expiresInMinutes} 分钟</p>
              </div>
            </div>
          </div>
        ) : null}

        {error ? (
          <p className="mt-5 rounded-[18px] border border-ink-black/20 bg-lavender-mist/60 px-4 py-3 text-sm text-graphite">
            {error}
          </p>
        ) : null}

        <Button
          className="mt-7 h-12 w-full rounded-full text-[15px]"
          variant="primary"
          onClick={handleRecover}
          disabled={!account.trim()}
          loading={submitting}
          loadingText="提交中..."
        >
          提交协助申请
        </Button>

        <Link className="mt-5 inline-flex items-center gap-2 text-sm text-graphite underline decoration-ink-black/25 underline-offset-4 hover:text-ink-black" href="/login">
          <ArrowLeft className="size-4" />
          返回登录
        </Link>
      </Card>
    </AuthLayout>
  );
}
