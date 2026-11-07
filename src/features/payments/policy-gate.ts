import type { Ctx, Result } from "../../contracts/common";
import type { CheckPurchasePolicyInput, PolicyCheck } from "../../contracts/purchases";

/** Preliminary check only: callers must revalidate under a durable order/policy lock. */
export async function checkBeforePayment(ctx: Ctx, input: CheckPurchasePolicyInput, check: (ctx: Ctx, input: CheckPurchasePolicyInput) => Promise<Result<PolicyCheck>>): Promise<Result<PolicyCheck>> {
  let result: Result<PolicyCheck>;
  try { result = await check(ctx, input); }
  catch { return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudieron comprobar las reglas de pago.", retryable: true } }; }
  if (!result.ok) return result;
  if (result.data.decision !== "auto_pay") return { ok: false, error: { code: "FORBIDDEN", message: result.data.decision === "needs_approval" ? "El pago necesita una aprobación verificable." : "Las reglas de la empresa rechazan este pago.", retryable: false } };
  return result;
}
