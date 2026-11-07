import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Ctx } from "@/contracts/common";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { readPaymentWithPorts } from "../read-payment-service";

/** Current persisted observation, not a fresh chain confirmation. */
export function getOrderPayment(ctx: Ctx, input: { order_id: string }) {
  return readPaymentWithPorts(ctx, input, {
    verifySession: async current => {
      const session = await getCompanyContext(current.company_id, { readOnlyCookies: true });
      return session.ok && session.data.actor_type === "user" && session.data.actor_id === current.actor_id && session.data.company_id === current.company_id;
    },
    read: async (current, orderId) => {
      const secret = getServerEnv().SUPABASE_SECRET_KEY;
      if (!secret) throw new Error("Payment store unavailable");
      const db = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
      const { data, error } = await db.rpc("read_order_payment", { p_company: current.company_id, p_actor: current.actor_id, p_order: orderId });
      if (error) throw new Error("Payment store unavailable");
      return data;
    },
  });
}
