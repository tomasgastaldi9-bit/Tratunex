import "server-only";
import { ActivityListInputSchema, DealListInputSchema } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { crmJson } from "./http";
import { crmFailure } from "./persistent-crm";
import { listActivities, listDeals } from "./public";

export async function listPipelineRequest(request: Request, entity: "deals" | "activities") {
  const context = await getCompanyContext();
  if (!context.ok) return crmJson(context);
  const parameters = new URL(request.url).searchParams;
  if ([...parameters.keys()].some(key => parameters.getAll(key).length > 1)) {
    return crmJson(crmFailure("VALIDATION_ERROR", "No repitas parámetros de consulta."));
  }
  const parsed = (entity === "deals" ? DealListInputSchema : ActivityListInputSchema).safeParse(Object.fromEntries(parameters));
  if (!parsed.success) return crmJson(crmFailure("VALIDATION_ERROR", "Revisá los filtros y el cursor del pipeline."));
  return entity === "deals" ? crmJson(await listDeals(context.data, parsed.data))
    : crmJson(await listActivities(context.data, parsed.data));
}
