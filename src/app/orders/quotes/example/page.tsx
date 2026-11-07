import { QuoteComparisonAccessState, QuoteComparisonView } from "@/features/crm/components/quote-comparison-view";
import { loadQuoteComparisonWorkspace } from "@/features/crm/server/quote-comparison-workspace";

export const dynamic = "force-dynamic";

export default async function QuoteComparisonExamplePage() {
  const result = await loadQuoteComparisonWorkspace({ example: true });
  if (!result.ok) return <QuoteComparisonAccessState code={result.error.code} message={result.error.message} />;
  if (!result.data.comparison) return null;
  return <QuoteComparisonView company={result.data.company} comparison={result.data.comparison} />;
}
