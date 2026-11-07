import { z } from "zod";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import type { PreparedIdentity, PreparedRecord, PreparedStore } from "./prepared-payment";

type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: { code?: string; message?: string } | null }> };
const envelopeSchema = z.object({ version: z.literal(1), iv: z.string().max(100), ciphertext: z.string().max(180000), tag: z.string().max(100) }).strict();
const rowSchema = z.object({ id: z.uuid(), state: z.literal("prepared"), tx_hash: z.string().regex(/^0x[0-9a-f]{64}$/), envelope: envelopeSchema, chain_id: z.literal(42161), sender: z.string(), nonce: z.number().int().nonnegative().safe(), token: z.string(), destination: z.string(), amount_atomic: z.string().regex(/^[1-9]\d{0,77}$/) });
const unavailable = () => new Error("No se pudo consultar la reserva de pago.");

/** Service-role RPC adapter. The caller must already authorize the user and order. */
export function createPreparedStore(client: RpcClient, identity: PreparedIdentity): PreparedStore {
  const params = { p_company: identity.companyId, p_order: identity.orderId, p_action: identity.actionId };
  return {
    read: async () => {
      const { data, error } = await client.rpc("get_prepared_payment", params);
      if (error?.code === "P0001" && error.message === "NOT_FOUND: prepared payment") return null;
      if (error) throw unavailable();
      const row = rowSchema.safeParse(data);
      if (!row.success || row.data.id !== identity.id || row.data.sender.toLowerCase() !== identity.sender.toLowerCase() || row.data.nonce !== identity.nonce || row.data.token.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase() || row.data.destination.toLowerCase() !== identity.recipient.toLowerCase() || row.data.amount_atomic !== identity.amount.toString()) throw unavailable();
      return { id: row.data.id, hash: row.data.tx_hash as `0x${string}`, envelope: JSON.stringify(row.data.envelope) };
    },
    write: async (record: PreparedRecord) => {
      if (record.id !== identity.id || !/^0x[0-9a-f]{64}$/.test(record.hash)) throw unavailable();
      let envelope: unknown;
      try { envelope = JSON.parse(record.envelope); } catch { throw unavailable(); }
      const parsed = envelopeSchema.safeParse(envelope);
      if (!parsed.success) throw unavailable();
      const { error } = await client.rpc("store_prepared_payment", { ...params, p_reservation_id: record.id, p_hash: record.hash, p_envelope: parsed.data });
      if (error) throw unavailable();
    },
  };
}
