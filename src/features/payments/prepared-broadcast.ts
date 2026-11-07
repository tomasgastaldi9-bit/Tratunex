import type { Hex } from "viem";
import { prepareSignedPayment, recoverSignedPayment, type PreparedIdentity, type PreparedStore } from "./prepared-payment";
import { signPayment, verifyPaymentFees } from "./sign-payment";
import { broadcastOnce } from "./broadcast-once";
import type { ParametersOfSignPayment } from "./sign-payment";

type Deps = { key: Uint8Array; store: PreparedStore; signer: ParametersOfSignPayment[2]; limits: ParametersOfSignPayment[1]; markStarted: () => Promise<"acquired" | "already_started">; send: (raw: Hex) => Promise<Hex> };
/** Caller must supply a previously authorized durable claim and an atomic broadcast mark. */
export async function submitPreparedPayment(identity: PreparedIdentity, deps: Deps): Promise<{ state: "unknown" | "submitted"; hash?: Hex }> {
  try {
    let recovered = await recoverSignedPayment(identity, deps.key, deps.store);
    if (!recovered.ok && recovered.error.code === "NOT_FOUND") {
      const signed = await signPayment(identity, deps.limits, deps.signer);
      if (!signed.ok) return { state: "unknown" };
      const saved = await prepareSignedPayment(identity, signed.raw, deps.key, deps.store);
      if (!saved.ok) return { state: "unknown" };
      recovered = await recoverSignedPayment(identity, deps.key, deps.store);
    }
    if (!recovered.ok || !verifyPaymentFees(recovered.data.raw, deps.limits)) return { state: "unknown" };
    const sent = await broadcastOnce(recovered.data, { markStarted: deps.markStarted, send: deps.send });
    return { ...sent, hash: recovered.data.hash };
  } catch { return { state: "unknown" }; }
}
