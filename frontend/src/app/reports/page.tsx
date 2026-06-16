import { ReportsClient } from "@/components/pages/reports-client";
import { reportApi } from "@/lib/services/api";

export default async function ReportsPage() {
  const workspace = await reportApi.workspace();

  return <ReportsClient workspace={workspace} />;
}
