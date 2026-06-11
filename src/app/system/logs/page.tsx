import { Download, Search } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, Td } from "@/components/ui/table";
import { systemApi } from "@/lib/services/api";

export default async function LogsPage() {
  const logs = await systemApi.logs();

  return (
    <>
      <SectionHeader
        eyebrow="Traceability"
        title="日志管理"
        action={<Button><Download className="size-4" />导出日志</Button>}
      />
      <Card>
        <div className="mb-4 grid gap-3 md:grid-cols-[1fr_160px_160px_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 size-4 -translate-y-1/2 text-warm-stone" />
            <Input className="w-full rounded-lg pl-9" placeholder="搜索操作人、模块、动作" />
          </div>
          <Select defaultValue="全部模块">
            <option>全部模块</option>
            <option>原始记录上传</option>
            <option>规则配置</option>
            <option>报告生成</option>
          </Select>
          <Select defaultValue="全部结果">
            <option>全部结果</option>
            <option>成功</option>
            <option>失败</option>
            <option>警告</option>
          </Select>
          <Button variant="primary">筛选</Button>
        </div>
        <DataTable headers={["模块", "操作人", "动作", "结果", "时间", "详情"]}>
          {logs.map((log) => (
            <tr key={log.id}>
              <Td>{log.module}</Td>
              <Td>{log.actor}</Td>
              <Td>{log.action}</Td>
              <Td><Badge tone={log.result === "成功" ? "success" : log.result === "失败" ? "danger" : "warning"}>{log.result}</Badge></Td>
              <Td>{log.time}</Td>
              <Td><button className="underline underline-offset-4">查看详情</button></Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
