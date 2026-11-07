import "server-only";
import { z } from "zod";
import { ContactDTOSchema, type DealListInput } from "@/contracts/crm";
import { getCompanyContext } from "@/features/platform/server/public";
import { getAuthorizedCrmClient } from "./client";
import { loadCompany } from "./contacts-workspace";
import { crmFailure, databaseFailure, normalizeCrmDates } from "./persistent-crm";
import { listDeals } from "./public";

export async function loadPipelinePage({ input }: { input: DealListInput }) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  const page = await listDeals(context.data, input);
  if (!page.ok) return page;
  const ids = [...new Set(page.data.items.map(deal => deal.contact_id))];
  if (!ids.length) return { ok: true, data: { ctx: context.data, company: company.data, page: page.data, contacts: [] } } as const;
  const client = await getAuthorizedCrmClient(context.data, { readOnlyCookies: true });
  if (!client.ok) return client;
  try {
    const response = await client.data.from("contacts").select("*").eq("company_id", context.data.company_id).in("id", ids);
    if (response.error) return databaseFailure<never>(response.error);
    const parsed = z.array(ContactDTOSchema).safeParse(normalizeCrmDates(response.data));
    if (!parsed.success || parsed.data.length !== ids.length || parsed.data.some(contact =>
      contact.company_id !== context.data.company_id || !ids.includes(contact.id))) {
      return crmFailure<never>("PROVIDER_ERROR", "No se pudieron confirmar los contactos de estas oportunidades.");
    }
    return { ok: true, data: { ctx: context.data, company: company.data, page: page.data, contacts: parsed.data } } as const;
  } catch {
    return crmFailure<never>("PROVIDER_UNAVAILABLE", "No se pudieron cargar los contactos del pipeline.", true);
  }
}
