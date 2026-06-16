import { RecordsClient } from "@/components/pages/records-client";
import { recordApi } from "@/lib/services/api";

export default async function RecordsPage() {
  const [files, events, fields, fieldsByFile] = await Promise.all([
    recordApi.files(),
    recordApi.parseTimeline(),
    recordApi.fields(),
    recordApi.fieldsByFile()
  ]);

  return <RecordsClient files={files} events={events} fields={fields} fieldsByFile={fieldsByFile} />;
}
