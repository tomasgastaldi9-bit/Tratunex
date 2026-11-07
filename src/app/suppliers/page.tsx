import { SupplierListInputSchema } from "@/contracts/crm";
import { SupplierAccessState, SuppliersListView } from "@/features/crm/components/supplier-view";
import { loadSuppliersPage } from "@/features/crm/server/suppliers-workspace";

export const dynamic = "force-dynamic";

export default async function SuppliersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const input = SupplierListInputSchema.safeParse(Object.fromEntries(Object.entries(params).filter(([, value]) => value !== "" && value !== undefined)));
  if (!input.success) return <SupplierAccessState code="VALIDATION_ERROR" />;
  const result = await loadSuppliersPage({ input: input.data });
  if (!result.ok) return <SupplierAccessState code={result.error.code} message={result.error.message} />;
  return <SuppliersListView company={result.data.company} page={result.data.page} filters={input.data} />;
}
