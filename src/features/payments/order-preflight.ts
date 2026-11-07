import { isAddress, zeroAddress } from "viem";
import { z } from "zod";
import type { Ctx, Result } from "../../contracts/common";
import type { CheckPurchasePolicyInput, PolicyCheck } from "../../contracts/purchases";

const walletSchema = z.object({ chain: z.literal("arbitrum"), address: z.string().refine(value => isAddress(value) && value.toLowerCase() !== zeroAddress) });
const orderSchema = z.object({ id: z.uuid(), company_id: z.uuid(), supplier_contact_id: z.uuid(), amount_atomic: z.string().regex(/^[1-9]\d{0,77}$/), pricing_status: z.literal("ready"), status: z.literal("approved"), version: z.number().int().positive(), wallet: walletSchema, wallet_version: z.number().int().positive(), approved_by: z.uuid(), approved_at: z.iso.datetime(), quote_source: z.enum(["call", "web"]) });
const supplierSchema = z.object({ id: z.uuid(), company_id: z.uuid(), collection_wallet: walletSchema, wallet_version: z.number().int().positive() });
type Dependencies = {
  getOrder: (ctx: Ctx, input: { order_id: string }) => Promise<Result<{ order: unknown }>>;
  getSupplier: (ctx: Ctx, input: { contact_id: string }) => Promise<Result<{ supplier: unknown }>>;
  checkPolicy: (ctx: Ctx, input: CheckPurchasePolicyInput) => Promise<Result<PolicyCheck>>;
};
const fail = (): Result<never> => ({ ok: false, error: { code: "CONFLICT", message: "La orden o el proveedor no están listos para el pago.", retryable: false } });

/** Read-only preflight. This is NOT an authorization or a transactional claim. */
export async function preflightOrder(ctx: Ctx, orderId: string, deps: Dependencies): Promise<Result<{ order_id: string; order_version: number; wallet_version: number; amount_atomic: string; policy_decision: "auto_pay" | "needs_approval"; authorization: "unverified" }>> {
  if (ctx.actor_type !== "user" || !z.uuid().safeParse(orderId).success) return fail();
  try {
    const orderResult = await deps.getOrder(ctx, { order_id: orderId });
    if (!orderResult.ok) return orderResult;
    const order = orderSchema.safeParse(orderResult.data.order);
    if (!order.success || order.data.id !== orderId || order.data.company_id !== ctx.company_id || BigInt(order.data.amount_atomic) >= BigInt(2) ** BigInt(256)) return fail();
    const supplierResult = await deps.getSupplier(ctx, { contact_id: order.data.supplier_contact_id });
    if (!supplierResult.ok) return supplierResult;
    const supplier = supplierSchema.safeParse(supplierResult.data.supplier);
    if (!supplier.success || supplier.data.id !== order.data.supplier_contact_id || supplier.data.company_id !== ctx.company_id || supplier.data.wallet_version !== order.data.wallet_version || supplier.data.collection_wallet.address.toLowerCase() !== order.data.wallet.address.toLowerCase()) return fail();
    const policy = await deps.checkPolicy(ctx, { amount_atomic: order.data.amount_atomic, supplier_contact_id: order.data.supplier_contact_id });
    if (!policy.ok) return policy;
    if (policy.data.decision !== "auto_pay" && policy.data.decision !== "needs_approval") return fail();
    // Even an approved order or auto_pay result is only a read; the claim must
    // revalidate policy, human approval and snapshots under transactional locks.
    return { ok: true, data: { order_id: order.data.id, order_version: order.data.version, wallet_version: supplier.data.wallet_version, amount_atomic: order.data.amount_atomic, policy_decision: policy.data.decision, authorization: "unverified" } };
  } catch { return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo comprobar la orden y sus reglas.", retryable: true } }; }
}
