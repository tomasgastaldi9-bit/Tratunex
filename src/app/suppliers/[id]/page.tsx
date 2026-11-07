import { notFound } from "next/navigation";
import { GetContactInputSchema } from "@/contracts/crm";
import { SupplierAccessState, SupplierDetailView } from "@/features/crm/components/supplier-view";
import { loadSupplierPage } from "@/features/crm/server/suppliers-workspace";

export const dynamic = "force-dynamic";

export default async function SupplierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const input = GetContactInputSchema.safeParse({ contact_id: id });
  if (!input.success) notFound();
  const result = await loadSupplierPage(input.data.contact_id);
  if (!result.ok) {
    if (result.error.code === "NOT_FOUND") notFound();
    return <SupplierAccessState code={result.error.code} message={result.error.message} />;
  }
  return <SupplierDetailView company={result.data.company} supplier={result.data.supplier} />;
}
