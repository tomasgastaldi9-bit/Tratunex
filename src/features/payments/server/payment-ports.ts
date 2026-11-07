import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, type Hex } from "viem";
import { arbitrum } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";
import { getCompanyContext } from "@/features/platform/server/public";
import { getPurchaseOrder } from "@/features/crm/server/public";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { OrderPaymentSchema } from "@/contracts/purchase-orders";
import type { ActionCtx } from "@/contracts/common";
import type { PreparedIdentity } from "../prepared-payment";
import { parsePaymentConfig } from "../payment-config";
import { claimPayment } from "../claim-store";
import { createPreparedStore } from "../prepared-store";
import { createBroadcastStore } from "../broadcast-store";
import { createObservationStore } from "../observation-store";
import { submitPreparedPayment } from "../prepared-broadcast";
import { reconcileStoredPayment } from "../reconcile-stored";
import { createPaymentReader } from "../chain-reader";
import { ARGT_ABI, TWIN_ARGT_ARBITRUM } from "../wallet-check";
import { paymentReady } from "../payment-readiness";

/** Not exposed by the public port. The caller must perform its own readiness checks. */
export function createPaymentPorts() {
  const config = parsePaymentConfig(process.env);
  const secret = getServerEnv().SUPABASE_SECRET_KEY;
  if (!config.ok || !secret) throw new Error("Configuración de pagos incompleta.");
  const db = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
  const account = privateKeyToAccount(config.privateKey);
  const chain = createPublicClient({ chain: arbitrum, transport: http(config.rpcUrl, { timeout: 10000, retryCount: 0 }) });
  const reader = createPaymentReader({
    getChainId: () => chain.getChainId(),
    getTransactionReceipt: ({ hash }) => chain.getTransactionReceipt({ hash }),
    getBlock: arg => "blockTag" in arg ? chain.getBlock({ blockTag: arg.blockTag }) : chain.getBlock({ blockNumber: arg.blockNumber }),
  });
  return {
    verifySession: async (ctx: ActionCtx) => {
      const current = await getCompanyContext(ctx.company_id, { readOnlyCookies: true });
      return current.ok && current.data.actor_type === "user" && current.data.actor_id === ctx.actor_id && current.data.company_id === ctx.company_id;
    },
    getOrderVersion: async (ctx: ActionCtx, id: string) => {
      const result = await getPurchaseOrder(ctx, { order_id: id });
      if (!result.ok || result.data.order.status !== "approved") throw new Error("Orden no disponible para pago.");
      return result.data.order.version;
    },
    getPendingNonce: async () => {
      if (await chain.getChainId() !== 42161) throw new Error("Red de pago incorrecta.");
      return chain.getTransactionCount({ address: account.address, blockTag: "pending" });
    },
    claim: (ctx: ActionCtx, input: { order_id: string; orderVersion: number; pendingNonce: number }) => claimPayment(db, { companyId: ctx.company_id, actorId: ctx.actor_id, orderId: input.order_id, actionId: ctx.action_id, orderVersion: input.orderVersion, pendingNonce: input.pendingNonce, sender: account.address }),
    submit: async (identity: PreparedIdentity) => {
      if (await chain.getChainId() !== 42161) throw new Error("Red de pago incorrecta.");
      const [nonce, eth, tokens] = await Promise.all([chain.getTransactionCount({ address: account.address, blockTag: "pending" }), chain.getBalance({ address: account.address }), chain.readContract({ address: TWIN_ARGT_ARBITRUM, abi: ARGT_ABI, functionName: "balanceOf", args: [account.address] })]);
      if (!paymentReady({ observedNonce: nonce, reservedNonce: identity.nonce, ethWei: eth, tokenAtomic: tokens, maxTotalFee: config.limits.maxTotalFee, amount: identity.amount })) throw new Error("El saldo o el nonce requieren conciliación.");
      return submitPreparedPayment(identity, {
        key: config.encryptionKey, store: createPreparedStore(db, identity), signer: account, limits: config.limits,
        markStarted: (hash: Hex) => createBroadcastStore(db, { companyId: identity.companyId, orderId: identity.orderId, id: identity.id, hash }).markStarted(),
        send: (raw: Hex) => chain.sendRawTransaction({ serializedTransaction: raw }),
      });
    },
    reconcile: (identity: PreparedIdentity) => reconcileStoredPayment(identity, { key: config.encryptionKey, store: createPreparedStore(db, identity), reader, persist: createObservationStore(db, { companyId: identity.companyId, orderId: identity.orderId, id: identity.id }).persist }),
    readPayment: async (ctx: ActionCtx, id: string) => {
      const { data, error } = await db.rpc("read_order_payment", { p_company: ctx.company_id, p_actor: ctx.actor_id, p_order: id });
      if (error) throw new Error("No se pudo consultar el pago.");
      if (data === null) return null;
      const payment = OrderPaymentSchema.safeParse(data);
      if (!payment.success) throw new Error("Pago incompatible.");
      return payment.data;
    },
  };
}
