import { describe, expect, it } from "vitest";
import { nextPaymentState } from "./payment-state";

describe("transiciones del pago", () => {
  it("solo permite enviar una transacción previamente registrada", () => {
    expect(nextPaymentState("reserved", "signed_persisted")).toBe("prepared");
    expect(nextPaymentState("prepared", "broadcast_ambiguous")).toBe("unknown");
    expect(nextPaymentState("unknown", "receipt_success")).toBe("confirmed");
    expect(() => nextPaymentState("reserved", "broadcast_ambiguous")).toThrow();
  });
  it("nunca vuelve a preparar pagos ambiguos, confirmados o revertidos", () => {
    for (const state of ["unknown", "confirmed", "reverted"] as const) expect(() => nextPaymentState(state, "signed_persisted")).toThrow();
    expect(nextPaymentState("unknown", "receipt_reverted")).toBe("reverted");
    expect(nextPaymentState("prepared", "receipt_success")).toBe("confirmed");
  });
});
