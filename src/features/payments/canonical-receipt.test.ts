import { describe, expect, it } from "vitest";
import type { Hex } from "viem";
import { inspectCanonicalReceipt } from "./canonical-receipt";

const blockHash = `0x${"a".repeat(64)}` as Hex;
const otherHash = `0x${"b".repeat(64)}` as Hex;
const receipt = { blockNumber: BigInt(100), blockHash };
const reader = (overrides: Partial<Parameters<typeof inspectCanonicalReceipt>[1]> = {}) => ({
  getBlockHash: async () => blockHash,
  getBlockNumber: async () => BigInt(102),
  ...overrides,
});

describe("comprobación de bloque del recibo", () => {
  it("solo informa suficiente profundidad cuando el bloque coincide y alcanza el mínimo", async () => {
    expect(await inspectCanonicalReceipt(receipt, reader(), BigInt(3))).toEqual({ state: "depth_reached", confirmations: "3" });
    expect(await inspectCanonicalReceipt(receipt, reader(), BigInt(4))).toEqual({ state: "pending", confirmations: "3" });
  });
  it("detecta que el recibo dejó de pertenecer al bloque canónico", async () => {
    expect((await inspectCanonicalReceipt(receipt, reader({ getBlockHash: async () => otherHash }), BigInt(1))).state).toBe("unknown");
    let calls = 0;
    expect((await inspectCanonicalReceipt(receipt, reader({ getBlockHash: async () => ++calls === 1 ? blockHash : otherHash }), BigInt(1))).state).toBe("unknown");
  });
  it("falla cerrado ante parámetros inválidos, red atrasada o error de RPC", async () => {
    expect((await inspectCanonicalReceipt(receipt, reader(), BigInt(0))).state).toBe("unknown");
    expect((await inspectCanonicalReceipt(receipt, reader({ getBlockNumber: async () => BigInt(99) }), BigInt(1))).state).toBe("unknown");
    expect((await inspectCanonicalReceipt(receipt, reader({ getBlockHash: async () => { throw new Error("offline"); } }), BigInt(1))).state).toBe("unknown");
  });
});
