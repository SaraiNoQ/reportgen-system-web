import { SystemUsersClient } from "@/components/pages/system-users-client";
import { systemApi } from "@/lib/services/api";

export default async function UsersPage() {
  const users = await systemApi.users();

  return <SystemUsersClient users={users} />;
}
