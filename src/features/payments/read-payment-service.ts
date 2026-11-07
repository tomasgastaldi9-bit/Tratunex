import { z } from "zod";
import type { Ctx, Result } from "../../contracts/common";
import { OrderPaymentSchema, type OrderPayment } from "../../contracts/purchase-orders";

const context = z.object({ company_id: z.uuid(), actor_id: z.uuid(), actor_type: z.literal("user") }).strict();
const inputSchema = z.object({ order_id: z.uuid() }).strict();
const unavailable = (): Result<never> => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar el estado del pago.", retryable: true } });

/** Reads the last durable observation; does not claim, sign, transmit or reconcile. */
export async function readPaymentWithPorts(ctx: Ctx, input: { order_id: string }, ports: {
  verifySession: (ctx: Ctx) => Promise<boolean>;
  read: (ctx: Ctx, orderId: string) => Promise<unknown>;
}): Promise<Result<{ payment: OrderPayment | null }>> {
  if (!context.safeParse(ctx).success || !inputSchema.safeParse(input).success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Contexto u orden inválidos.", retryable: false } };
  try {
    if (!await ports.verifySession(ctx)) return { ok: false, error: { code: "FORBIDDEN", message: "No tenés acceso a esta empresa.", retryable: false } };
    const value = await ports.read(ctx, input.order_id);
    if (value === null) return { ok: true, data: { payment: null } };
    const parsed = OrderPaymentSchema.safeParse(value);
    return parsed.success ? { ok: true, data: { payment: parsed.data } } : unavailable();
  } catch { return unavailable(); }
}
