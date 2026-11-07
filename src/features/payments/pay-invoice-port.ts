import { z } from "zod";
import type { ActionCtx, Result } from "../../contracts/common";

/** Proposed response shape compatible with ORD-03; no current implementation returns success. */
export type PaymentDTO = { id: string; status: "reserved" | "prepared" | "submitted" | "pending" | "unknown" | "confirmed" | "reverted" | "failed"; tx_hash: string | null; explorer_url: string | null; amount_atomic: string; token: "ARGt"; chain: "arbitrum" };
const contextSchema = z.object({ company_id: z.uuid(), actor_id: z.uuid(), actor_type: z.literal("user"), action_id: z.string().trim().min(1).max(120) }).strict();
const inputSchema = z.object({ order_id: z.uuid() }).strict();

/** Contract stub: never signs, transmits, reserves, or reports a successful payment. */
export async function payInvoiceUnavailable(ctx: ActionCtx, input: { order_id: string }): Promise<Result<{ payment: PaymentDTO }>> {
  if (!contextSchema.safeParse(ctx).success || !inputSchema.safeParse(input).success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Contexto u orden inválidos.", retryable: false } };
  return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "El pago aún no está habilitado; no se envió ninguna transacción.", retryable: false } };
}
