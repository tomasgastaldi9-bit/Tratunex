import { OrdersListView, PurchaseOrderAccessState } from "@/features/crm/components/purchase-order-view";
import { loadPurchaseOrdersPage } from "@/features/crm/server/purchase-orders-workspace";
import { OrdersExampleView } from "@/features/crm/components/demo-example-views";
import { isMissingCrmSchema } from "@/features/crm/mocks/demo-examples";

export const dynamic = "force-dynamic";
export default async function OrdersPage() {
  const result = await loadPurchaseOrdersPage();
  // Sin tabla de órdenes en la base: ejemplo rotulado "Datos de prueba" para la demo.
  if (!result.ok && isMissingCrmSchema(result.error)) return <OrdersExampleView />;
  if (!result.ok) return <PurchaseOrderAccessState code={result.error.code} message={result.error.message} />;
  return <OrdersListView company={result.data.company} orders={result.data.orders ?? []} />;
}
