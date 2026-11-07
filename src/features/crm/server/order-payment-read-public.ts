import "server-only";
import { createPurchaseOrdersCrm } from "./purchase-orders-service";
import { getAuthorizedCrmClient } from "./client";

// Read-only public boundary for PAY-02; it has no dependency on the payment port.
const orders = createPurchaseOrdersCrm(async (ctx, operation, input) => {
  const authorized = await getAuthorizedCrmClient(ctx, { readOnlyCookies: true });
  if (!authorized.ok) return { data: authorized, error: null };
  return authorized.data.rpc("orders_execute", { p_ctx: ctx, p_operation: operation, p_input: input });
});
export const getPaymentOrder = orders.getPurchaseOrder;
