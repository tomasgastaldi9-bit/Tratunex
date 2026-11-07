import { describe, expect, it, vi } from "vitest";
import { createPaymentReader } from "./chain-reader";

const hash = `0x${"a".repeat(64)}` as const;
describe("adaptador RPC de conciliación", () => {
  it("lee red, recibo, bloque canónico y altura finalized", async () => {
    const client = { getChainId: vi.fn().mockResolvedValue(42161), getTransactionReceipt: vi.fn().mockResolvedValue(null), getBlock: vi.fn().mockImplementation(async (arg) => "blockTag" in arg ? { number: BigInt(100), hash } : { number: BigInt(99), hash }) };
    const reader = createPaymentReader(client);
    expect(await reader.getChainId()).toBe(42161);
    expect(await reader.getReceipt(hash)).toBeNull();
    expect(await reader.getFinalizedBlockNumber()).toBe(BigInt(100));
    expect(await reader.getBlockHash(BigInt(99))).toBe(hash);
    expect(client.getBlock).toHaveBeenCalledWith({ blockTag: "finalized" });
    expect(client.getBlock).toHaveBeenCalledWith({ blockNumber: BigInt(99) });
  });
  it("rechaza una cabecera finalizada sin número", async () => {
    const reader = createPaymentReader({ getChainId: async () => 42161, getTransactionReceipt: async () => null, getBlock: async () => ({ number: null, hash: null }) });
    await expect(reader.getFinalizedBlockNumber()).rejects.toThrow();
  });
});
