import "server-only";
import { createClient } from "@supabase/supabase-js";
import { privateKeyToAccount } from "viem/accounts";
import type { ActionCtx } from "@/contracts/common";
import { getPaymentOrder } from "@/features/crm/server/order-payment-read-public";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { claimDemoPayment } from "../demo-claim-store";
import { DEMO_AMOUNT, DEMO_DESTINATION, DEMO_SENDER } from "../demo-constants";
import { parsePaymentConfig } from "../payment-config";
import { createPaymentPorts } from "./payment-ports";

export function createDemoPaymentPorts() {
  const config = parsePaymentConfig(process.env), secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!config.ok || !secret) throw new Error("Demo no configurada.");
  const account = privateKeyToAccount(config.privateKey);
  if (account.address.toLowerCase() !== DEMO_SENDER.toLowerCase()) throw new Error("Emisor de demo incorrecto.");
  const db = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const base = createPaymentPorts();
  return {
    ...base,
    getOrderVersion: async (ctx: ActionCtx, id: string) => {
      const result = await getPaymentOrder(ctx, { order_id: id });
      if (!result.ok || result.data.order.status !== "awaiting_approval" || result.data.order.quote_source !== "example"
        || result.data.order.amount_atomic !== DEMO_AMOUNT || result.data.order.wallet?.chain !== "arbitrum"
        || result.data.order.wallet.address.toLowerCase() !== DEMO_DESTINATION.toLowerCase()) throw new Error("Orden de demo no disponible.");
      return result.data.order.version;
    },
    claim: (ctx: ActionCtx, input: { order_id: string; orderVersion: number; pendingNonce: number }) => claimDemoPayment(db,
      { companyId: ctx.company_id, actorId: ctx.actor_id, orderId: input.order_id, actionId: ctx.action_id,
        orderVersion: input.orderVersion, pendingNonce: input.pendingNonce, sender: account.address }),
  };
}
