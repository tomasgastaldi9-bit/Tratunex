import "server-only";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPurchaseRequest, rankQuotes } from "@/features/agent/server/public";
import { listSupplierQuotes } from "@/features/voice/server/public";
import { createQuoteComparisonExample } from "../mocks/quote-comparison-example";
import { loadCompany } from "./contacts-workspace";
import { getSupplier } from "./public";
import { createQuoteComparisonService } from "./quote-comparison-service";
import { listPurchasesForComparison } from "./purchase-picker";

// Only public module APIs: no direct quote table reads or duplicated ranking.
const compare = createQuoteComparisonService({ getPurchaseRequest, getSupplier, listQuotes: listSupplierQuotes, rankQuotes });

export async function loadQuoteComparisonWorkspace(input: { purchase_request_id?: string; page?: number; example?: boolean }) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  if (input.example) return { ok: true, data: {
    company: company.data, comparison: createQuoteComparisonExample(context.data.company_id), purchases: null,
  } } as const;
  if (!input.purchase_request_id) {
    const purchases = await listPurchasesForComparison(context.data, { page: input.page ?? 0 });
    if (!purchases.ok) return purchases;
    return { ok: true, data: { company: company.data, comparison: null, purchases: purchases.data } } as const;
  }
  const comparison = await compare(context.data, { purchase_request_id: input.purchase_request_id });
  if (!comparison.ok) return comparison;
  return { ok: true, data: { company: company.data, comparison: comparison.data, purchases: null } } as const;
}
