import type { ProjectStatus } from "@/lib/types/domain";
import { Badge, StatusDot } from "@/components/ui/badge";

export function ProjectStatusBadge({ status }: { status: ProjectStatus }) {
  const tone =
    status === "已完成" ? "success" : status === "待审核" ? "warning" : status === "待上传" ? "danger" : status === "解析中" ? "active" : "neutral";

  return (
    <Badge tone={tone}>
      <StatusDot tone={tone} />
      {status}
    </Badge>
  );
}
