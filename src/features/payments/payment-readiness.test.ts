import { describe, expect, it } from "vitest";
import { paymentReady } from "./payment-readiness";
describe("saldo y nonce antes de firmar", () => {
  const request = { observedNonce: 7, reservedNonce: 7, ethWei: BigInt(200), tokenAtomic: BigInt(100), maxTotalFee: BigInt(200), amount: BigInt(100) };
  it("requiere nonce idéntico y saldo suficiente", () => {
    expect(paymentReady(request)).toBe(true);
    expect(paymentReady({ ...request, observedNonce: 8 })).toBe(false);
    expect(paymentReady({ ...request, observedNonce: 6 })).toBe(false);
    expect(paymentReady({ ...request, ethWei: BigInt(199) })).toBe(false);
    expect(paymentReady({ ...request, tokenAtomic: BigInt(99) })).toBe(false);
  });
});
