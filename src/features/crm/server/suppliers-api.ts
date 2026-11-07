import "server-only";
import { SupplierListInputSchema } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { crmJson } from "./http";
import { crmFailure } from "./persistent-crm";
import { listSuppliers } from "./public";

export async function listSuppliersRequest(request: Request): Promise<Response> {
  const context = await getCompanyContext();
  if (!context.ok) return crmJson(context);
  const parameters = new URL(request.url).searchParams;
  if ([...parameters.keys()].some(key => parameters.getAll(key).length > 1)) {
    return crmJson(crmFailure("VALIDATION_ERROR", "No repitas parámetros de consulta."));
  }
  const parsed = SupplierListInputSchema.safeParse(Object.fromEntries(parameters));
  if (!parsed.success) return crmJson(crmFailure("VALIDATION_ERROR", "Revisá los filtros, el límite y el cursor de proveedores."));
  return crmJson(await listSuppliers(context.data, parsed.data));
}
