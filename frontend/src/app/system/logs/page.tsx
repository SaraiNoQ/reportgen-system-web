import { SystemLogsClient } from "@/components/pages/system-logs-client";
import { systemApi } from "@/lib/services/api";

export default async function LogsPage() {
  const logs = await systemApi.logs();

  return <SystemLogsClient logs={logs} />;
}
