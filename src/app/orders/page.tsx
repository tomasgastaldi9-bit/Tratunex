import { OrdersListView, PurchaseOrderAccessState } from "@/features/crm/components/purchase-order-view";
import { loadPurchaseOrdersPage } from "@/features/crm/server/purchase-orders-workspace";

export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  const result = await loadPurchaseOrdersPage();
  if (!result.ok) return <PurchaseOrderAccessState code={result.error.code} message={result.error.message} />;
  return <OrdersListView company={result.data.company} orders={result.data.orders ?? []} />;
}
