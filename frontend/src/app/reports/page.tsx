import { ReportsClient } from "@/components/pages/reports-client";
import { reportApi } from "@/lib/services/api";

export default async function ReportsPage() {
  const sections = await reportApi.sections();

  return <ReportsClient sections={sections} />;
}
