import { isAddress, type Address } from "viem";
import { z } from "zod";
import type { PreparedIdentity } from "./prepared-payment";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import { validateTransfer } from "./payment-request";

type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Input = { companyId: string; actorId: string; orderId: string };
const row = z.object({ id: z.uuid(), action_id: z.string().trim().min(1).max(120), chain_id: z.literal(42161),
  sender: z.string().refine(isAddress), nonce: z.number().int().nonnegative().safe(), token: z.string().refine(isAddress),
  destination: z.string().refine(isAddress), amount_atomic: z.string() }).strict();

/** Reads only a marked reservation; never creates an attempt. */
export async function readReconciliationIdentity(client: Client, input: Input): Promise<PreparedIdentity | null> {
  const { data, error } = await client.rpc("read_payment_reconciliation_identity", { p_company: input.companyId, p_actor: input.actorId, p_order: input.orderId });
  if (error) throw new Error("No se pudo consultar la identidad de pago.");
  if (data === null) return null;
  const parsed = row.safeParse(data);
  if (!parsed.success || parsed.data.token.toLowerCase() !== TWIN_ARGT_ARBITRUM.toLowerCase()
    || !validateTransfer({ sender: parsed.data.sender, destination: parsed.data.destination, amountAtomic: parsed.data.amount_atomic }).ok) throw new Error("Identidad de pago incompatible.");
  return { id: parsed.data.id, companyId: input.companyId, orderId: input.orderId, actionId: parsed.data.action_id, sender: parsed.data.sender as Address,
    recipient: parsed.data.destination as Address, amount: BigInt(parsed.data.amount_atomic), nonce: parsed.data.nonce };
}
