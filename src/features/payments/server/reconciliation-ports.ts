import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http } from "viem";
import { arbitrum } from "viem/chains";
import type { Ctx } from "@/contracts/common";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { PreparedIdentity } from "../prepared-payment";
import { createPreparedStore } from "../prepared-store";
import { createObservationStore } from "../observation-store";
import { reconcileStoredPayment } from "../reconcile-stored";
import { createPaymentReader } from "../chain-reader";
import { readReconciliationIdentity } from "../reconciliation-identity-store";

/** Observation needs the encryption key, but never the wallet's signing key. */
export function createReconciliationPorts() {
  const encryption = process.env.PAYMENT_ENCRYPTION_KEY, rpcUrl = process.env.PAYMENT_RPC_URL;
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!encryption || !/^[0-9a-fA-F]{64}$/.test(encryption) || !rpcUrl || new URL(rpcUrl).protocol !== "https:" || !secret) throw new Error("Conciliación no configurada.");
  const key = Uint8Array.from(Buffer.from(encryption, "hex"));
  const db = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const chain = createPublicClient({ chain: arbitrum, transport: http(rpcUrl, { timeout: 10000, retryCount: 0 }) });
  const reader = createPaymentReader({ getChainId: () => chain.getChainId(), getTransactionReceipt: ({ hash }) => chain.getTransactionReceipt({ hash }),
    getBlock: arg => "blockTag" in arg ? chain.getBlock({ blockTag: arg.blockTag }) : chain.getBlock({ blockNumber: arg.blockNumber }) });
  return {
    verifySession: async (ctx: Ctx) => {
      const current = await getCompanyContext(ctx.company_id, { readOnlyCookies: true });
      return current.ok && current.data.actor_type === "user" && current.data.actor_id === ctx.actor_id && current.data.company_id === ctx.company_id;
    },
    readIdentity: (ctx: Ctx, orderId: string) => readReconciliationIdentity(db, { companyId: ctx.company_id, actorId: ctx.actor_id, orderId }),
    reconcile: (identity: PreparedIdentity) => reconcileStoredPayment(identity, { key, store: createPreparedStore(db, identity), reader,
      persist: createObservationStore(db, { companyId: identity.companyId, orderId: identity.orderId, id: identity.id }).persist }),
    readPayment: async (ctx: Ctx, orderId: string) => {
      const { data, error } = await db.rpc("read_order_payment", { p_company: ctx.company_id, p_actor: ctx.actor_id, p_order: orderId });
      if (error) throw new Error("No se pudo consultar el pago.");
      return data;
    },
  };
}
