import "server-only";
import { privateKeyToAccount } from "viem/accounts";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { ActionCtx, Ctx, Result } from "@/contracts/common";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { PaymentDTO } from "../pay-invoice-port";
import { demoPaymentConfigured } from "../demo-config";
import { executeConfiguredPayment } from "../payment-entry";
import { createDemoPaymentPorts } from "./demo-ports";

export function demoPaymentEnabled(): boolean {
  try {
    const key = process.env.AGENT_WALLET_PRIVATE_KEY;
    if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) return false;
    return demoPaymentConfigured(process.env, privateKeyToAccount(key as `0x${string}`).address);
  } catch { return false; }
}

export async function payDemoOrder(ctx: ActionCtx, input: { order_id: string }): Promise<Result<{ payment: PaymentDTO }>> {
  if (!demoPaymentEnabled()) return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "La transferencia de demo no está habilitada.", retryable: false } };
  return executeConfiguredPayment(process.env.PAYMENT_DEMO_ENABLED, ctx, input, createDemoPaymentPorts);
}

/** Only exposes availability for the active session and specifically scoped order. */
export async function isDemoOrderEnabled(ctx: Ctx, orderId: string): Promise<boolean> {
  try {
    if (!demoPaymentEnabled() || ctx.actor_type !== "user" || !z.uuid().safeParse(orderId).success) return false;
    const current = await getCompanyContext(ctx.company_id, { readOnlyCookies: true });
    if (!current.ok || current.data.actor_type !== "user" || current.data.actor_id !== ctx.actor_id || current.data.company_id !== ctx.company_id) return false;
    const secret = getServerEnv().SUPABASE_SECRET_KEY;
    if (!secret) return false;
    const db = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
    const { data, error } = await db.rpc("demo_order_authorized", { p_company: ctx.company_id, p_actor: ctx.actor_id, p_order: orderId });
    return !error && data === true;
  } catch { return false; }
}
