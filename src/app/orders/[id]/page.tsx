import { PurchaseOrderView, PurchaseOrderAccessState } from "@/features/crm/components/purchase-order-view";
import { loadPurchaseOrdersPage } from "@/features/crm/server/purchase-orders-workspace";

export const dynamic = "force-dynamic";
export default async function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const result = await loadPurchaseOrdersPage((await params).id);
  if (!result.ok) return <PurchaseOrderAccessState code={result.error.code} message={result.error.message} />;
  if (!result.data.order) return <PurchaseOrderAccessState code="NOT_FOUND" />;
  return <PurchaseOrderView company={result.data.company} order={result.data.order} paymentAvailable={result.data.paymentAvailable} />;
}
