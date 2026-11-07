import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Address, type Hex } from "viem";
import { TRANSFER_EVENT } from "./receipt-check";
import { observePayment } from "./chain-observation";

const sender = "0x0000000000000000000000000000000000000001" as const;
const recipient = "0x0000000000000000000000000000000000000002" as const;
const token = "0x59863989d080B22476DB95656d0C3CC18be92214" as const;
const hash = `0x${"a".repeat(64)}` as Hex;
const expected = { hash, sender, recipient, amount: BigInt(100) };
const log = { address: token, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer", args: { from: sender, to: recipient } }) as [Hex, ...Hex[]], data: encodeAbiParameters([{ type: "uint256" }], [BigInt(100)]) };
const receipt = { transactionHash: hash, from: sender as Address, to: token, status: "success" as const, logs: [log], blockNumber: BigInt(100) };
describe("observación de la red", () => {
  it("solo describe un recibo coincidente, sin afirmar finality", async () => {
    expect(await observePayment(expected, { getChainId: async () => 42161, getReceipt: async () => receipt, getBlockNumber: async () => BigInt(102) })).toEqual({ state: "observed_success", confirmations: "3" });
  });
  it("representa recibos ausentes, red incorrecta y errores sin autorizar reenvíos", async () => {
    expect((await observePayment(expected, { getChainId: async () => 42161, getReceipt: async () => null, getBlockNumber: async () => BigInt(100) })).state).toBe("unknown");
    expect((await observePayment(expected, { getChainId: async () => 8453, getReceipt: async () => receipt, getBlockNumber: async () => BigInt(100) })).state).toBe("unknown");
    expect((await observePayment(expected, { getChainId: async () => { throw new Error("offline"); }, getReceipt: async () => receipt, getBlockNumber: async () => BigInt(100) })).state).toBe("unknown");
  });
  it("identifica una ejecución revertida sin confundirla con un pago", async () => {
    expect(await observePayment(expected, { getChainId: async () => 42161, getReceipt: async () => ({ ...receipt, status: "reverted" }), getBlockNumber: async () => BigInt(100) })).toEqual({ state: "observed_revert", confirmations: "1" });
  });
  it("rechaza recibos de otra transacción o sin la transferencia esperada", async () => {
    const observe = (changed: typeof receipt) => observePayment(expected, { getChainId: async () => 42161, getReceipt: async () => changed, getBlockNumber: async () => BigInt(102) });
    expect((await observe({ ...receipt, transactionHash: `0x${"b".repeat(64)}` as Hex })).state).toBe("inconsistent");
    expect((await observe({ ...receipt, logs: [] })).state).toBe("inconsistent");
    expect((await observe({ ...receipt, from: recipient })).state).toBe("inconsistent");
  });
});
