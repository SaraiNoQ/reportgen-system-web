import Link from "next/link";
import { ArrowRight, LockKeyhole, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/forms";

export default function LoginPage() {
  return (
    <main className="grid min-h-screen place-items-center px-5 py-10">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1fr_360px]">
        <section className="flex flex-col justify-center">
          <p className="mb-5 text-xs uppercase tracking-[0.2em] text-warm-stone">Inspection Report Workspace</p>
          <h1 className="serif max-w-3xl text-6xl leading-[1.05] text-ink-black md:text-7xl">
            智能检测报告生成系统
          </h1>
          <p className="mt-8 max-w-2xl text-base leading-7 text-graphite">
            将机床检测原始记录、规则模板与报告编制流程集中到一个可追溯的工作台中。首期使用 mock adapter 演示完整业务流。
          </p>
          <div className="mt-10 grid max-w-2xl grid-cols-2 gap-4">
            {["原始记录解析", "字段规则配置", "报告初稿生成", "日志追溯"].map((item) => (
              <div key={item} className="rounded-lg border border-ink-black/25 px-3.5 py-2 text-sm">
                {item}
              </div>
            ))}
          </div>
        </section>
        <Card className="p-5">
          <div className="mb-5">
            <p className="text-xs uppercase tracking-[0.18em] text-warm-stone">Login</p>
            <h2 className="serif mt-3 text-4xl">进入系统</h2>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="mb-2 block text-sm text-graphite">账号</span>
              <div className="relative">
                <UserRound className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
                <Input className="w-full pl-11" defaultValue="zhanggong" />
              </div>
            </label>
            <label className="block">
              <span className="mb-2 block text-sm text-graphite">密码</span>
              <div className="relative">
                <LockKeyhole className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
                <Input className="w-full pl-11" type="password" defaultValue="report-demo" />
              </div>
            </label>
            <div className="flex items-center justify-between text-sm text-graphite">
              <label className="flex items-center gap-2">
                <input type="checkbox" defaultChecked />
                记住账号
              </label>
              <button className="underline decoration-ink-black/25 underline-offset-4">忘记密码</button>
            </div>
          </div>
          <Link href="/records" className="mt-6 block">
            <Button className="w-full" variant="primary">
              登录
              <ArrowRight className="size-4" />
            </Button>
          </Link>
          <p className="mt-5 text-xs leading-5 text-warm-stone">演示环境：登录不会请求真实鉴权服务，后续由 auth adapter 接入。</p>
        </Card>
      </div>
    </main>
  );
}
