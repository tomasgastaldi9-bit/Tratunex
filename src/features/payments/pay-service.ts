import type { ActionCtx, Result } from "../../contracts/common";
import type { PaymentDTO } from "./pay-invoice-port";
import type { PreparedIdentity } from "./prepared-payment";
import { OrderPaymentSchema } from "../../contracts/purchase-orders";
import { z } from "zod";
type Ports = { verifySession: (ctx: ActionCtx) => Promise<boolean>; getOrderVersion: (ctx: ActionCtx, id: string) => Promise<number>; getPendingNonce: () => Promise<number>; claim: (ctx: ActionCtx, input: { order_id: string; orderVersion: number; pendingNonce: number }) => Promise<{ ok: true; identity: PreparedIdentity } | { ok: false }>; submit: (identity: PreparedIdentity) => Promise<unknown>; reconcile: (identity: PreparedIdentity) => Promise<unknown>; readPayment: (ctx: ActionCtx, id: string) => Promise<PaymentDTO | null> };
const inputSchema = z.object({ order_id: z.uuid() }).strict();
const contextSchema = z.object({ company_id: z.uuid(), actor_id: z.uuid(), actor_type: z.literal("user"), action_id: z.string().trim().min(1).max(120) }).strict();
const unavailable = (): Result<never> => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo confirmar el estado del pago. Consultá la orden antes de reintentar.", retryable: false } });

/** Internal orchestration. Ports must enforce durable claim, gas limits and verified chain evidence. */
export async function payInvoiceWithPorts(ctx: ActionCtx, input: { order_id: string }, ports: Ports): Promise<Result<{ payment: PaymentDTO }>> {
  if (!contextSchema.safeParse(ctx).success || !inputSchema.safeParse(input).success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Contexto u orden inválidos.", retryable: false } };
  try {
    if (!await ports.verifySession(ctx)) return { ok: false, error: { code: "FORBIDDEN", message: "No tenés acceso a esta empresa.", retryable: false } };
    const orderVersion = await ports.getOrderVersion(ctx, input.order_id);
    const pendingNonce = await ports.getPendingNonce();
    if (!Number.isSafeInteger(orderVersion) || orderVersion < 1 || !Number.isSafeInteger(pendingNonce) || pendingNonce < 0) return unavailable();
    const claim = await ports.claim(ctx, { order_id: input.order_id, orderVersion, pendingNonce });
    if (!claim.ok || claim.identity.companyId !== ctx.company_id || claim.identity.orderId !== input.order_id) return unavailable();
    try { await ports.submit(claim.identity); } catch { /* A failed response cannot authorize another send. */ }
    try { await ports.reconcile(claim.identity); } catch { /* Read the durable state even if the RPC is unavailable. */ }
    const payment = OrderPaymentSchema.safeParse(await ports.readPayment(ctx, input.order_id));
    if (!payment.success || payment.data.id !== claim.identity.id || payment.data.amount_atomic !== claim.identity.amount.toString()) return unavailable();
    return { ok: true, data: { payment: payment.data } };
  } catch { return unavailable(); }
}
