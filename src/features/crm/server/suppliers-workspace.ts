import "server-only";
import { getCompanyContext } from "@/features/platform/server/public";
import type { SupplierListInput } from "@/contracts/crm";
import { loadCompany } from "./contacts-workspace";
import { getSupplier, listSuppliers } from "./public";

export async function loadSuppliersPage({ input }: { input: SupplierListInput }) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  const page = await listSuppliers(context.data, input);
  if (!page.ok) return page;
  return { ok: true, data: { ctx: context.data, company: company.data, page: page.data } } as const;
}

export async function loadSupplierPage(contact_id: string) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  const result = await getSupplier(context.data, { contact_id });
  if (!result.ok) return result;
  return { ok: true, data: { ctx: context.data, company: company.data, supplier: result.data.supplier } } as const;
}
