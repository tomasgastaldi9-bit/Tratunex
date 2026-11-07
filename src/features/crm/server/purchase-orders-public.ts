import "server-only";
import { createPurchaseOrdersCrm } from "./purchase-orders-service";
import { getAuthorizedCrmClient } from "./client";

// PAY-02 publica un stub no disponible; falta la reclamación acordada de una orden.
// No hay firmador, red de pagos ni fallback mock conectado a este módulo.
const orders = createPurchaseOrdersCrm(async (ctx, operation, input) => {
  const authorized = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!authorized.ok) return { data: authorized, error: null };
  return authorized.data.rpc("orders_execute", { p_ctx: ctx, p_operation: operation, p_input: input });
});
export const createPurchaseOrder = orders.createPurchaseOrder;
export const getPurchaseOrder = orders.getPurchaseOrder;
export const listPurchaseOrders = orders.listPurchaseOrders;
export const refreshPurchaseOrder = orders.refreshPurchaseOrder;
export const approvePurchaseOrder = orders.approvePurchaseOrder;
export const approveAndPayPurchaseOrder = orders.approveAndPayPurchaseOrder;
export const orderPaymentAvailable = orders.paymentAvailable;
