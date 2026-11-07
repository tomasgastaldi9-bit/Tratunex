import type { ActionCtx, Result } from "../../contracts/common";
import type { PaymentDTO } from "./pay-invoice-port";
import { payInvoiceWithPorts } from "./pay-service";

/** An explicit production switch is required; constructing ports never sends. */
export async function executeConfiguredPayment(flag: string | undefined, ctx: ActionCtx, input: { order_id: string },
  createPorts: () => Parameters<typeof payInvoiceWithPorts>[2]): Promise<Result<{ payment: PaymentDTO }>> {
  if (flag !== "true") return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "El pago aún no está habilitado; no se envió ninguna transacción.", retryable: false } };
  try { return await payInvoiceWithPorts(ctx, input, createPorts()); }
  catch { return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo configurar el pago. Consultá el estado antes de reintentar.", retryable: false } }; }
}
