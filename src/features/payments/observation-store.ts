import type { Hex } from "viem";
type Status = "unknown" | "pending" | "confirmed" | "reverted";
type RpcClient = { rpc: (name: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown; error: unknown }> };
type Identity = { companyId: string; orderId: string; id: string };
/** Internal only: SQL trusts the server to verify finality before recording a terminal status. */
export function createObservationStore(client: RpcClient, identity: Identity) {
  return { persist: async (status: Status, hash: Hex): Promise<Status> => {
    const { data, error } = await client.rpc("record_payment_observation", { p_company: identity.companyId, p_order: identity.orderId, p_reservation: identity.id, p_hash: hash, p_status: status });
    if (error || (data !== "unknown" && data !== "pending" && data !== "confirmed" && data !== "reverted")) throw new Error("No se pudo guardar la observación.");
    return data;
  } };
}
