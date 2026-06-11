import Link from "next/link";
import { Bell, Building2, ChevronDown, LogOut, PanelLeftClose, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/forms";

export function TopNav({
  onSidebarToggle
}: {
  onSidebarToggle: () => void;
}) {
  return (
    <header
      className="sticky top-0 z-10 border-b border-ink-black/15 bg-parchment-cream/90 px-3.5 py-2 backdrop-blur transition-[margin] duration-200 lg:ml-[var(--sidebar-width)]"
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Button className="lg:hidden" variant="ghost" onClick={onSidebarToggle} aria-label="切换导航栏">
            <PanelLeftClose className="size-4" />
          </Button>
          <Button className="hidden lg:inline-flex" variant="secondary">
            <Building2 className="size-4" />
            智能制造产线项目
            <ChevronDown className="size-4" />
          </Button>
          <div className="relative hidden max-w-md flex-1 md:block">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
            <Input className="w-full rounded-lg pl-9" placeholder="搜索项目、报告、字段规则" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" aria-label="消息">
            <Bell className="size-4" />
            消息 <span className="rounded-md bg-ink-black px-1.5 py-0.5 text-xs text-parchment-cream">12</span>
          </Button>
          <Button variant="secondary">张工</Button>
          <Link href="/login">
            <Button variant="ghost" aria-label="退出登录">
              <LogOut className="size-4" />
            </Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
