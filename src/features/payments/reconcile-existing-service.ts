import { z } from "zod";
import type { Ctx, Result } from "../../contracts/common";
import { OrderPaymentSchema, type OrderPayment } from "../../contracts/purchase-orders";
import type { PreparedIdentity } from "./prepared-payment";

const context = z.object({ company_id: z.uuid(), actor_id: z.uuid(), actor_type: z.literal("user") }).strict();
const inputSchema = z.object({ order_id: z.uuid() }).strict();
const unavailable = (): Result<never> => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar el estado del pago.", retryable: true } });

/** Observes a previously marked attempt only; it has no signing or sending port. */
export async function reconcileExistingPayment(ctx: Ctx, input: { order_id: string }, ports: {
  verifySession: (ctx: Ctx) => Promise<boolean>;
  readIdentity: (ctx: Ctx, orderId: string) => Promise<PreparedIdentity | null>;
  reconcile: (identity: PreparedIdentity) => Promise<{ chain_checked: boolean }>;
  readPayment: (ctx: Ctx, orderId: string) => Promise<unknown>;
}): Promise<Result<{ payment: OrderPayment | null; chain_checked: boolean }>> {
  if (!context.safeParse(ctx).success || !inputSchema.safeParse(input).success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Contexto u orden inválidos.", retryable: false } };
  try {
    if (!await ports.verifySession(ctx)) return { ok: false, error: { code: "FORBIDDEN", message: "No tenés acceso a esta empresa.", retryable: false } };
    const identity = await ports.readIdentity(ctx, input.order_id);
    if (identity && (identity.companyId !== ctx.company_id || identity.orderId !== input.order_id)) return unavailable();
    let chain_checked = false;
    if (identity) {
      try { chain_checked = (await ports.reconcile(identity)).chain_checked === true; } catch { /* Retain the last persisted observation. */ }
    }
    const saved = await ports.readPayment(ctx, input.order_id);
    if (saved === null) return identity ? unavailable() : { ok: true, data: { payment: null, chain_checked } };
    const parsed = OrderPaymentSchema.safeParse(saved);
    if (!parsed.success || (identity && (parsed.data.id !== identity.id || parsed.data.amount_atomic !== identity.amount.toString()))) return unavailable();
    return { ok: true, data: { payment: parsed.data, chain_checked } };
  } catch { return unavailable(); }
}
