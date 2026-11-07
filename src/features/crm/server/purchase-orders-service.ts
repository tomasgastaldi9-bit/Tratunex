import type { ActionCtx, Ctx, Result } from "../../../contracts/common";
import {
  ApprovePurchaseOrderInputSchema, CreatePurchaseOrderDataSchema, CreatePurchaseOrderInputSchema,
  GetPurchaseOrderInputSchema, PurchaseOrderDataSchema, PurchaseOrderListInputSchema, PurchaseOrderPageSchema,
  RefreshPurchaseOrderInputSchema, OrderPaymentSchema,
  type ApprovePurchaseOrderInput, type CreatePurchaseOrderInput, type GetPurchaseOrderInput,
  type PurchaseOrderListInput, type RefreshPurchaseOrderInput, type OrderPayment, type PurchaseOrder,
} from "../../../contracts/purchase-orders";
import { resultSchema } from "../../../contracts/common";
import { z } from "zod";
import { createCrmOperationCaller, crmFailure, type CrmExecutor } from "./persistent-crm";

/** Se conecta exclusivamente después de revisar la reclamación atómica con PAY-02. */
export type ReviewedOrderPaymentPort = {
  availability: "unavailable" | "ready";
  payInvoice: (ctx: ActionCtx, input: { order_id: string }) => Promise<Result<{ payment: OrderPayment }>>;
};

export function createPurchaseOrdersCrm(execute: CrmExecutor, paymentPort?: ReviewedOrderPaymentPort) {
  const call = createCrmOperationCaller(execute);
  const human = <T>(ctx: Ctx, work: () => Promise<Result<T>>): Promise<Result<T>> => ctx.actor_type === "user"
    ? work() : Promise.resolve(crmFailure("FORBIDDEN", "La acción sobre la orden requiere una persona autenticada."));
  const getPurchaseOrder = (ctx: Ctx, input: GetPurchaseOrderInput) => call(ctx, "getPurchaseOrder", input, GetPurchaseOrderInputSchema, PurchaseOrderDataSchema, false);
  const approvePurchaseOrder = (ctx: ActionCtx, input: ApprovePurchaseOrderInput) => human(ctx,
    () => call(ctx, "approvePurchaseOrder", input, ApprovePurchaseOrderInputSchema, PurchaseOrderDataSchema));
  const payApproved = async (ctx: ActionCtx, order: PurchaseOrder): Promise<Result<{ order: PurchaseOrder; payment: OrderPayment }>> => {
    if (paymentPort?.availability !== "ready") return crmFailure("PROVIDER_UNAVAILABLE", "El servicio de pagos todavía no está disponible. La orden conserva su estado.");
    if (order.status !== "approved" || !order.amount_atomic || order.wallet?.chain !== "arbitrum") return crmFailure("CONFLICT", "La orden no tiene una aprobación y un destino de pago vigentes.");
    try {
      const result = resultSchema(z.object({ payment: OrderPaymentSchema })).safeParse(await paymentPort.payInvoice(ctx, { order_id: order.id }));
      if (!result.success) return crmFailure("PROVIDER_ERROR", "Pagos devolvió un resultado incompatible. Consultá el estado antes de reintentar.");
      if (!result.data.ok) return result.data;
      if (result.data.data.payment.amount_atomic !== order.amount_atomic) return crmFailure("PROVIDER_ERROR", "El resultado de pago no corresponde al importe aprobado. Consultá el estado.");
      return { ok: true, data: { order, payment: result.data.data.payment } };
    } catch { return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo confirmar el pago. Consultá el estado; no inicies otra transferencia.", true); }
  };
  return {
    paymentAvailable: paymentPort?.availability === "ready",
    createPurchaseOrder: (ctx: ActionCtx, input: CreatePurchaseOrderInput) => human(ctx,
      () => call(ctx, "createPurchaseOrder", input, CreatePurchaseOrderInputSchema, CreatePurchaseOrderDataSchema)),
    refreshPurchaseOrder: (ctx: ActionCtx, input: RefreshPurchaseOrderInput) => human(ctx,
      () => call(ctx, "refreshPurchaseOrder", input, RefreshPurchaseOrderInputSchema, PurchaseOrderDataSchema)),
    getPurchaseOrder,
    listPurchaseOrders: (ctx: Ctx, input: PurchaseOrderListInput) => call(ctx, "listPurchaseOrders", input, PurchaseOrderListInputSchema, PurchaseOrderPageSchema, false),
    approvePurchaseOrder,
    async approveAndPayPurchaseOrder(ctx: ActionCtx, input: ApprovePurchaseOrderInput): Promise<Result<{ order: PurchaseOrder; payment: OrderPayment }>> {
      if (ctx.actor_type !== "user") return crmFailure("FORBIDDEN", "El pago requiere una persona autenticada.");
      // No se guarda una aprobación como efecto lateral de una integración ausente.
      if (paymentPort?.availability !== "ready") return crmFailure("PROVIDER_UNAVAILABLE", "El servicio de pagos todavía no está disponible. La orden conserva su estado.");
      const approved = await approvePurchaseOrder(ctx, input);
      if (!approved.ok) return approved;
      return payApproved(ctx, approved.data.order);
    },
    async resumeApprovedPayment(ctx: ActionCtx, input: GetPurchaseOrderInput): Promise<Result<{ order: PurchaseOrder; payment: OrderPayment }>> {
      if (ctx.actor_type !== "user") return crmFailure("FORBIDDEN", "El pago requiere una persona autenticada.");
      if (paymentPort?.availability !== "ready") return crmFailure("PROVIDER_UNAVAILABLE", "El servicio de pagos todavía no está disponible. La orden conserva su estado.");
      const order = await getPurchaseOrder(ctx, input);
      return order.ok ? payApproved(ctx, order.data.order) : order;
    },
  };
}
