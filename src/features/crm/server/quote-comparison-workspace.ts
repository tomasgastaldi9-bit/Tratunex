import "server-only";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPurchaseRequest } from "@/features/agent/server/public";
import { createQuoteComparisonExample } from "../mocks/quote-comparison-example";
import { loadCompany } from "./contacts-workspace";
import { getSupplier } from "./public";
import { createQuoteComparisonService } from "./quote-comparison-service";

// QUO-02 y BUY-03 aún no publican los lectores acordados. No se consulta una
// tabla supuesta ni se sustituye una recomendación de IA con un ranking local.
const compare = createQuoteComparisonService({ getPurchaseRequest, getSupplier });

export async function loadQuoteComparisonWorkspace(input: { purchase_request_id?: string; example?: boolean }) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  if (input.example) return { ok: true, data: {
    company: company.data, comparison: createQuoteComparisonExample(context.data.company_id),
  } } as const;
  if (!input.purchase_request_id) return { ok: true, data: { company: company.data, comparison: null } } as const;
  const comparison = await compare(context.data, { purchase_request_id: input.purchase_request_id });
  if (!comparison.ok) return comparison;
  return { ok: true, data: { company: company.data, comparison: comparison.data } } as const;
}
