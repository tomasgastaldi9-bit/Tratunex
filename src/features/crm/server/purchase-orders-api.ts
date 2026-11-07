import { z } from "zod";
import { ApprovePurchaseOrderInputSchema, CreatePurchaseOrderInputSchema, PurchaseOrderListInputSchema, RefreshPurchaseOrderInputSchema } from "../../../contracts/purchase-orders";
import { getCompanyContext } from "../../platform/server/public";
import { approveAndPayPurchaseOrder, createPurchaseOrder, getPurchaseOrder, listPurchaseOrders, refreshPurchaseOrder } from "./purchase-orders-public";
import { crmJson, handleCrmMutation } from "./http";
import { crmFailure } from "./persistent-crm";
import { reconcileOrderPayment } from "@/features/payments/server/public";

const context = () => getCompanyContext(undefined, { readOnlyCookies: true });
const versionSchema = z.object({ expected_version: z.number().int().positive() }).strict();
export async function listOrdersRequest(request: Request) {
  const authorized = await context();
  if (!authorized.ok) return crmJson(authorized);
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const input = PurchaseOrderListInputSchema.safeParse({ ...params, ...(params.limit ? { limit: Number(params.limit) } : {}) });
  if (!input.success) return crmJson(crmFailure("VALIDATION_ERROR", "Revisá los filtros de órdenes."));
  return crmJson(await listPurchaseOrders(authorized.data, input.data));
}
export const createOrderRequest = (request: Request) => handleCrmMutation(request, CreatePurchaseOrderInputSchema, context, createPurchaseOrder);
export async function getOrderRequest(order_id: string) {
  const authorized = await context();
  return crmJson(authorized.ok ? await getPurchaseOrder(authorized.data, { order_id }) : authorized);
}
export const payOrderRequest = (request: Request, order_id: string) => handleCrmMutation(request, versionSchema, context,
  (ctx, input) => {
    const payload = ApprovePurchaseOrderInputSchema.safeParse({ order_id, ...input });
    return payload.success ? approveAndPayPurchaseOrder(ctx, payload.data) : Promise.resolve(crmFailure("VALIDATION_ERROR", "La orden no es válida."));
  });
export const refreshOrderRequest = (request: Request, order_id: string) => handleCrmMutation(request, versionSchema, context,
  (ctx, input) => {
    const payload = RefreshPurchaseOrderInputSchema.safeParse({ order_id, ...input });
    return payload.success ? refreshPurchaseOrder(ctx, payload.data) : Promise.resolve(crmFailure("VALIDATION_ERROR", "La orden no es válida."));
  });
export const reconcileOrderPaymentRequest = (request: Request, order_id: string) => handleCrmMutation(request, z.object({}).strict(), context,
  (ctx) => reconcileOrderPayment({ company_id: ctx.company_id, actor_id: ctx.actor_id, actor_type: ctx.actor_type }, { order_id }));
