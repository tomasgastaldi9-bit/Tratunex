import { describe, expect, it } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { TRANSFER_EVENT } from "./receipt-check";
import { reconcilePayment } from "./reconcile-payment";

const sender = "0x0000000000000000000000000000000000000001" as const;
const recipient = "0x0000000000000000000000000000000000000002" as const;
const token = "0x59863989d080B22476DB95656d0C3CC18be92214" as const;
const hash = `0x${"a".repeat(64)}` as Hex, blockHash = `0x${"b".repeat(64)}` as Hex;
const expected = { hash, sender, recipient, amount: BigInt(100) };
const log = { address: token, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer", args: { from: sender, to: recipient } }) as [Hex, ...Hex[]], data: encodeAbiParameters([{ type: "uint256" }], [BigInt(100)]) };
const receipt = { transactionHash: hash, from: sender, to: token, status: "success" as const, logs: [log], blockNumber: BigInt(100), blockHash };
const reader = (overrides: Partial<Parameters<typeof reconcilePayment>[1]> = {}) => ({ getChainId: async () => 42161, getReceipt: async () => receipt, getFinalizedBlockNumber: async () => BigInt(100), getBlockHash: async () => blockHash, ...overrides });
describe("conciliación de pago", () => {
  it("confirma solo un recibo coincidente en un bloque canónico finalizado", async () => {
    expect(await reconcilePayment(expected, reader())).toEqual({ state: "confirmed" });
    expect(await reconcilePayment(expected, reader({ getFinalizedBlockNumber: async () => BigInt(99) }))).toEqual({ state: "pending" });
  });
  it("mantiene incierto un bloque reorganizado, una RPC fallida o un recibo ausente", async () => {
    expect(await reconcilePayment(expected, reader({ getBlockHash: async () => `0x${"c".repeat(64)}` }))).toEqual({ state: "unknown" });
    expect(await reconcilePayment(expected, reader({ getReceipt: async () => null }))).toEqual({ state: "unknown" });
    expect(await reconcilePayment(expected, reader({ getFinalizedBlockNumber: async () => { throw new Error("offline"); } }))).toEqual({ state: "unknown" });
  });
  it("identifica un revert solo cuando el bloque es finalizado y no confirma un evento diferente", async () => {
    expect(await reconcilePayment(expected, reader({ getReceipt: async () => ({ ...receipt, status: "reverted" }) }))).toEqual({ state: "reverted" });
    expect(await reconcilePayment(expected, reader({ getReceipt: async () => ({ ...receipt, logs: [] }) }))).toEqual({ state: "unknown" });
  });
});
