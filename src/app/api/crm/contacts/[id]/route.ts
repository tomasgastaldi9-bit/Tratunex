import { UpsertContactInputSchema } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { mutateContact } from "@/features/crm/server/contacts-api";
import { crmJson } from "@/features/crm/server/http";
import { getContact, updateContact } from "@/features/crm/server/public";

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, { params }: RouteContext) {
  const context = await getCompanyContext();
  if (!context.ok) return crmJson(context);
  return crmJson(await getContact(context.data, { contact_id: (await params).id }));
}
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params;
  return mutateContact(request, UpsertContactInputSchema, (ctx, input) => updateContact(ctx, { ...input, contact_id: id }));
}
