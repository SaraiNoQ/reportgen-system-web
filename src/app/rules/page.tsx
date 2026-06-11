import { RulesClient } from "@/components/pages/rules-client";
import { ruleApi } from "@/lib/services/api";

export default async function RulesPage() {
  const templates = await ruleApi.templates();

  return <RulesClient templates={templates} />;
}
