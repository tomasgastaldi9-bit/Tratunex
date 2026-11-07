import type { Hex } from "viem";
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Identity = { companyId: string; orderId: string; id: string; hash: Hex };
/** Internal only. Authorization and validation of the signed transaction happen separately. */
export function createBroadcastStore(client: RpcClient, identity: Identity) {
  return { markStarted: async (): Promise<"acquired" | "already_started"> => {
    const { data, error } = await client.rpc("mark_payment_broadcast", { p_company: identity.companyId, p_order: identity.orderId, p_reservation: identity.id, p_hash: identity.hash });
    if (error || typeof data !== "boolean") throw new Error("No se pudo confirmar la marca de transmisión.");
    return data ? "acquired" : "already_started";
  } };
}
