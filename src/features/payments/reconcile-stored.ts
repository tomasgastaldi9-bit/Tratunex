import type { Hex } from "viem";
import { recoverSignedPayment, type PreparedIdentity, type PreparedStore } from "./prepared-payment";
import { reconcilePayment } from "./reconcile-payment";
type Status = "unknown" | "pending" | "confirmed" | "reverted";
type Deps = { key: Uint8Array; store: PreparedStore; reader: Parameters<typeof reconcilePayment>[1]; persist: (state: Status, hash: Hex) => Promise<string> };
/** Caller must reauthorize access to the order and provide a trusted chain reader. */
export async function reconcileStoredPayment(identity: PreparedIdentity, deps: Deps): Promise<{ state: Status; hash?: Hex; chain_checked: boolean }> {
  try {
    const recovered = await recoverSignedPayment(identity, deps.key, deps.store);
    if (!recovered.ok) return { state: "unknown", chain_checked: false };
    const observation = await reconcilePayment({ hash: recovered.data.hash, sender: identity.sender, recipient: identity.recipient, amount: identity.amount }, deps.reader);
    const persisted = await deps.persist(observation.state, recovered.data.hash);
    if (persisted !== "unknown" && persisted !== "pending" && persisted !== "confirmed" && persisted !== "reverted") return { state: "unknown", hash: recovered.data.hash, chain_checked: false };
    return { state: persisted, hash: recovered.data.hash, chain_checked: observation.state !== "unknown" };
  } catch { return { state: "unknown", chain_checked: false }; }
}
