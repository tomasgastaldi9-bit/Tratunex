import { isAddress, type Address } from "viem";
import { z } from "zod";
import type { PreparedIdentity } from "./prepared-payment";

import { DEMO_SENDER, DEMO_DESTINATION, DEMO_AMOUNT } from "./demo-constants";
type Client = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Input = { companyId: string; actorId: string; orderId: string; actionId: string; orderVersion: number; sender: Address; pendingNonce: number };
const request = z.object({ companyId: z.uuid(), actorId: z.uuid(), orderId: z.uuid(), actionId: z.string().trim().min(1).max(120), orderVersion: z.number().int().positive().safe(), sender: z.string().refine(isAddress), pendingNonce: z.number().int().nonnegative().safe() }).strict();
const row = z.object({ id: z.uuid(), state: z.enum(["reserved", "prepared"]), nonce: z.number().int().nonnegative().safe(), action_id: z.string().trim().min(1).max(120), amount_atomic: z.literal(DEMO_AMOUNT), destination: z.string().refine(isAddress) }).strict();

export async function claimDemoPayment(client: Client, input: Input): Promise<{ ok: true; identity: PreparedIdentity } | { ok: false }> {
  try {
    if (!request.safeParse(input).success || input.sender.toLowerCase() !== DEMO_SENDER.toLowerCase()) return { ok: false };
    const { data, error } = await client.rpc("claim_demo_order_payment", { p_company: input.companyId, p_actor: input.actorId, p_order: input.orderId, p_action: input.actionId, p_version: input.orderVersion, p_sender: input.sender, p_pending_nonce: input.pendingNonce });
    const parsed = row.safeParse(data);
    if (error || !parsed.success || parsed.data.destination.toLowerCase() !== DEMO_DESTINATION.toLowerCase()) return { ok: false };
    return { ok: true, identity: { id: parsed.data.id, companyId: input.companyId, orderId: input.orderId, actionId: parsed.data.action_id,
      sender: input.sender, recipient: parsed.data.destination as Address, amount: BigInt(DEMO_AMOUNT), nonce: parsed.data.nonce } };
  } catch { return { ok: false }; }
}
