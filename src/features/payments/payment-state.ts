export type PaymentState = "reserved" | "prepared" | "unknown" | "confirmed" | "reverted";
export type PaymentEvent = "signed_persisted" | "broadcast_ambiguous" | "receipt_success" | "receipt_reverted";

/** Pure transition policy; durable storage and chain confirmation are separate requirements. */
export function nextPaymentState(state: PaymentState, event: PaymentEvent): PaymentState {
  if (state === "reserved" && event === "signed_persisted") return "prepared";
  if (state === "prepared" && event === "broadcast_ambiguous") return "unknown";
  if ((state === "prepared" || state === "unknown") && event === "receipt_success") return "confirmed";
  if ((state === "prepared" || state === "unknown") && event === "receipt_reverted") return "reverted";
  throw new Error("Transición de pago no permitida");
}
