import "server-only";
import { z } from "zod";
import type { ActionCtx, Result } from "@/contracts/common";
import { ContactListInputSchema } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { crmJson, handleCrmMutation } from "./http";
import { crmFailure } from "./persistent-crm";
import { listContacts } from "./public";

export function mutateContact<I, O>(request: Request, schema: z.ZodType<I>, action: (ctx: ActionCtx, input: I) => Promise<Result<O>>) {
  return handleCrmMutation(request, schema, () => getCompanyContext(), action);
}

export async function listContactsRequest(request: Request): Promise<Response> {
  const context = await getCompanyContext();
  if (!context.ok) return crmJson(context);
  const parameters = new URL(request.url).searchParams;
  if ([...parameters.keys()].some(key => parameters.getAll(key).length > 1)) {
    return crmJson(crmFailure("VALIDATION_ERROR", "No repitas parámetros de consulta."));
  }
  const parsed = ContactListInputSchema.safeParse(Object.fromEntries(parameters));
  if (!parsed.success) return crmJson(crmFailure("VALIDATION_ERROR", "Revisá los filtros, el límite y el cursor."));
  return crmJson(await listContacts(context.data, parsed.data));
}
