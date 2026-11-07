import { DealListInputSchema } from "@/contracts/crm";
import { PipelineAccessState, PipelineView } from "@/features/crm/components/pipeline-view";
import { loadPipelinePage } from "@/features/crm/server/pipeline-workspace";

export const dynamic = "force-dynamic";

export default async function PipelinePage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const input = DealListInputSchema.safeParse(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined)));
  if (!input.success) return <PipelineAccessState code="VALIDATION_ERROR" />;
  const result = await loadPipelinePage({ input: input.data });
  if (!result.ok) return <PipelineAccessState code={result.error.code} message={result.error.message} />;
  return <PipelineView company={result.data.company} page={result.data.page} contacts={result.data.contacts} filters={input.data} />;
}
