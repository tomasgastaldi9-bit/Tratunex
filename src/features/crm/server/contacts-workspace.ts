import "server-only";
import { z } from "zod";
import type { Ctx, Result } from "@/contracts/common";
import type { ContactListInput } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { getAuthorizedCrmClient } from "./client";
import { crmFailure, databaseFailure } from "./persistent-crm";
import { getContact, listContacts } from "./public";

const CompanySchema = z.object({ id: z.uuid(), name: z.string() });
async function loadCompany(ctx: Ctx) {
  const client = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!client.ok) return client;
  try {
    const response = await client.data.from("companies").select("id,name").eq("id", ctx.company_id).maybeSingle();
    if (response.error) return databaseFailure<z.infer<typeof CompanySchema>>(response.error);
    const parsed = CompanySchema.safeParse(response.data);
    if (!parsed.success || parsed.data.id !== ctx.company_id) return crmFailure<z.infer<typeof CompanySchema>>("PROVIDER_ERROR", "No se pudo cargar la empresa activa.");
    return { ok: true, data: { ...parsed.data, industry: null } } as const;
  } catch {
    return crmFailure<z.infer<typeof CompanySchema>>("PROVIDER_UNAVAILABLE", "No se pudo cargar la empresa activa.", true);
  }
}

export async function loadContactsPage(options: { readOnlyCookies?: boolean; input: ContactListInput }) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: options.readOnlyCookies ?? true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  const page = await listContacts(context.data, options.input);
  if (!page.ok) return page;
  return { ok: true, data: { ctx: context.data, company: company.data, page: page.data } } as const;
}

export async function loadContactPage(contact_id: string) {
  const context: Result<Ctx> = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  const result = await getContact(context.data, { contact_id });
  if (!result.ok) return result;
  return { ok: true, data: { ctx: context.data, company: company.data, contact: result.data.contact } } as const;
}
