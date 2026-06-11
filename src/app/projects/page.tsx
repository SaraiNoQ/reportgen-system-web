import { ProjectsClient } from "@/components/pages/projects-client";
import { projectApi } from "@/lib/services/api";

export default async function ProjectsPage() {
  const [metrics, projects] = await Promise.all([projectApi.metrics(), projectApi.list()]);

  return <ProjectsClient metrics={metrics} projects={projects} />;
}
