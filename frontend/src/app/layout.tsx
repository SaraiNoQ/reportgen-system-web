import type { Metadata } from "next";
import { cookies } from "next/headers";
import { AppShellWrapper } from "@/components/layout/app-shell-wrapper";
import { AppProvider } from "@/components/providers/app-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "智能检测报告生成系统",
  description: "面向机床检测原始记录解析与报告编制的大前端原型",
  icons: {
    icon: "/favicon.ico"
  }
};

export default async function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  const cookieStore = await cookies();
  const initialCollapsed = cookieStore.get("report-shell-sidebar")?.value === "collapsed";

  return (
    <html lang="zh-CN">
      <body>
        <AppProvider>
          <AppShellWrapper initialCollapsed={initialCollapsed}>
            {children}
          </AppShellWrapper>
        </AppProvider>
      </body>
    </html>
  );
}
