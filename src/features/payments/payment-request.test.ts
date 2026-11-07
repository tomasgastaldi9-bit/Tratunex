import { describe, expect, it } from "vitest";
import { validateTransfer } from "./payment-request";

const sender = "0x0000000000000000000000000000000000000001";
const destination = "0x0000000000000000000000000000000000000002";
describe("validación de transferencia", () => {
  it("acepta importes enteros exactos de ARGt", () => {
    expect(validateTransfer({ sender, destination, amountAtomic: "1000000000000000000" })).toMatchObject({ ok: true });
  });
  it("rechaza cantidades inválidas, destinos vacíos y al propio emisor", () => {
    for (const amountAtomic of ["0", "-1", "1.1", "1e18", " 1", (BigInt(2) ** BigInt(256)).toString()]) {
      expect(validateTransfer({ sender, destination, amountAtomic })).toMatchObject({ ok: false });
    }
    expect(validateTransfer({ sender, destination: sender, amountAtomic: "1" })).toMatchObject({ ok: false });
    expect(validateTransfer({ sender, destination: "0x0000000000000000000000000000000000000000", amountAtomic: "1" })).toMatchObject({ ok: false });
    expect(validateTransfer({ sender, destination: "no-wallet", amountAtomic: "1" })).toMatchObject({ ok: false });
  });
});
