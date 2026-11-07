import "server-only";
import type { Ctx, Result } from "@/contracts/common";
import type { OrderPayment } from "@/contracts/purchase-orders";
import { reconcileExistingPayment } from "../reconcile-existing-service";
import { createReconciliationPorts } from "./reconciliation-ports";

/** No claim, signature or broadcast is performed during reconciliation. */
export async function reconcileOrderPayment(ctx: Ctx, input: { order_id: string }): Promise<Result<{ payment: OrderPayment | null; chain_checked: boolean }>> {
  try { return await reconcileExistingPayment(ctx, input, createReconciliationPorts()); }
  catch { return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar el estado del pago.", retryable: true } }; }
}
