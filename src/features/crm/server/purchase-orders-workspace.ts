import "server-only";
import { getCompanyContext } from "@/features/platform/server/public";
import { loadCompany } from "./contacts-workspace";
import { getPurchaseOrder, listPurchaseOrders, orderPaymentAvailable } from "./purchase-orders-public";

export async function loadPurchaseOrdersPage(order_id?: string) {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok) return context;
  const company = await loadCompany(context.data);
  if (!company.ok) return company;
  if (order_id) {
    const result = await getPurchaseOrder(context.data, { order_id });
    if (!result.ok) return result;
    return { ok: true, data: { company: company.data, order: result.data.order, orders: null, paymentAvailable: orderPaymentAvailable } } as const;
  }
  const result = await listPurchaseOrders(context.data, { limit: 50 });
  if (!result.ok) return result;
  return { ok: true, data: { company: company.data, order: null, orders: result.data.items, paymentAvailable: orderPaymentAvailable } } as const;
}
