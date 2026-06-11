import { Plus, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, SectionHeader } from "@/components/ui/card";
import { Input, Select } from "@/components/ui/forms";
import { DataTable, Td } from "@/components/ui/table";
import { systemApi } from "@/lib/services/api";

export default async function UsersPage() {
  const users = await systemApi.users();

  return (
    <>
      <SectionHeader
        eyebrow="System Management"
        title="用户管理"
        action={
          <div className="flex gap-3">
            <Button><Upload className="size-4" />批量导入</Button>
            <Button variant="primary"><Plus className="size-4" />新增用户</Button>
          </div>
        }
      />
      <Card>
        <div className="mb-4 flex flex-wrap gap-3">
          <Input className="w-full sm:w-80" placeholder="搜索用户名、部门" />
          <Select defaultValue="全部角色">
            <option>全部角色</option>
            <option>管理员</option>
            <option>编制员</option>
            <option>审核员</option>
          </Select>
          <Select defaultValue="全部状态">
            <option>全部状态</option>
            <option>启用</option>
            <option>禁用</option>
          </Select>
        </div>
        <DataTable headers={["用户名", "角色", "所属部门", "账号状态", "最近登录", "操作"]}>
          {users.map((user) => (
            <tr key={user.id}>
              <Td>{user.name}</Td>
              <Td>{user.role}</Td>
              <Td>{user.department}</Td>
              <Td><Badge tone={user.status === "启用" ? "success" : "danger"}>{user.status}</Badge></Td>
              <Td>{user.lastLogin}</Td>
              <Td>
                <div className="flex gap-3">
                  <button className="underline underline-offset-4">编辑</button>
                  <button className="text-graphite underline underline-offset-4">{user.status === "启用" ? "禁用" : "启用"}</button>
                </div>
              </Td>
            </tr>
          ))}
        </DataTable>
      </Card>
    </>
  );
}
