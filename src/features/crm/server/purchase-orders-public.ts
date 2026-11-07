import "server-only";
import { createPurchaseOrdersCrm } from "./purchase-orders-service";
import { getAuthorizedCrmClient } from "./client";
import { payInvoice, paymentEnabled } from "@/features/payments/server/public";

// No habilita pagos si el interruptor explícito de servidor está apagado.
const orders = createPurchaseOrdersCrm(async (ctx, operation, input) => {
  const authorized = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!authorized.ok) return { data: authorized, error: null };
  return authorized.data.rpc("orders_execute", { p_ctx: ctx, p_operation: operation, p_input: input });
}, { availability: paymentEnabled() ? "ready" : "unavailable", payInvoice });
export const createPurchaseOrder = orders.createPurchaseOrder;
export const getPurchaseOrder = orders.getPurchaseOrder;
export const listPurchaseOrders = orders.listPurchaseOrders;
export const refreshPurchaseOrder = orders.refreshPurchaseOrder;
export const approvePurchaseOrder = orders.approvePurchaseOrder;
export const approveAndPayPurchaseOrder = orders.approveAndPayPurchaseOrder;
export const resumeApprovedPayment = orders.resumeApprovedPayment;
export const orderPaymentAvailable = orders.paymentAvailable;
