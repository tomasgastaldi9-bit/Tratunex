import { z } from "zod";
import { QuoteComparisonAccessState, QuoteComparisonStart, QuoteComparisonView } from "@/features/crm/components/quote-comparison-view";
import { loadQuoteComparisonWorkspace } from "@/features/crm/server/quote-comparison-workspace";

export const dynamic = "force-dynamic";
const searchSchema = z.object({ purchase_request_id: z.uuid().optional() }).strict();

export default async function QuoteComparisonPage({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const input = searchSchema.safeParse(await searchParams);
  if (!input.success) return <QuoteComparisonAccessState code="VALIDATION_ERROR" message="Ingresá el ID válido de una compra de tu empresa." />;
  const result = await loadQuoteComparisonWorkspace(input.data);
  if (!result.ok) return <QuoteComparisonAccessState code={result.error.code} message={result.error.message} />;
  return result.data.comparison
    ? <QuoteComparisonView company={result.data.company} comparison={result.data.comparison} />
    : <QuoteComparisonStart company={result.data.company} />;
}
