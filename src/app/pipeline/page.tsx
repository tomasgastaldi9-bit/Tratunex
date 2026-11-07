import { readCrmPageDemo } from "@/features/crm/server/demo";
import { DemoShell } from "@/features/crm/components/demo-shell";
import { PipelineView } from "@/features/crm/components/crm-views";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: {
  searchParams: Promise<{ demo?: string | string[] }>;
}) {
  const data = await readCrmPageDemo((await searchParams).demo);
  return <DemoShell data={data}><PipelineView key={data.demo} data={data} /></DemoShell>;
}
