import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { prepareSignedPayment, type PreparedRecord } from "./prepared-payment";
import { signPayment } from "./sign-payment";
import { TRANSFER_EVENT } from "./receipt-check";
import { reconcileStoredPayment } from "./reconcile-stored";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const identity = { id: "reservation", companyId: "company", orderId: "order", actionId: "action", sender: account.address, recipient: "0x0000000000000000000000000000000000000002" as const, amount: BigInt(100), nonce: 4 };
const limits = { gas: BigInt(100000), maxFeePerGas: BigInt(200000000), maxPriorityFeePerGas: BigInt(100000000), maxTotalFee: BigInt(20000000000000) };
const key = randomBytes(32), token = "0x59863989d080B22476DB95656d0C3CC18be92214" as const, blockHash = `0x${"b".repeat(64)}` as Hex;
describe("conciliación del pago guardado", () => {
  it("recupera y verifica los bytes antes de guardar el estado final", async () => {
    let record: PreparedRecord | null = null;
    const store = { read: async () => record, write: async (value: PreparedRecord) => { record = value; } };
    const signed = await signPayment(identity, limits, account);
    if (!signed.ok) throw new Error("fixture signing failed");
    const prepared = await prepareSignedPayment(identity, signed.raw, key, store);
    if (!prepared.ok) throw new Error("fixture preparation failed");
    const log = { address: token, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer", args: { from: account.address, to: identity.recipient } }) as [Hex, ...Hex[]], data: encodeAbiParameters([{ type: "uint256" }], [identity.amount]) };
    const receipt = { transactionHash: prepared.data.hash, from: account.address, to: token, status: "success" as const, logs: [log], blockNumber: BigInt(100), blockHash };
    const reader = { getChainId: async () => 42161, getReceipt: async () => receipt, getFinalizedBlockNumber: async () => BigInt(100), getBlockHash: async () => blockHash };
    const persist = vi.fn(async (state: string) => state);
    expect(await reconcileStoredPayment(identity, { key, store, reader, persist })).toEqual({ state: "confirmed", hash: prepared.data.hash });
    expect(persist).toHaveBeenCalledWith("confirmed", prepared.data.hash);
    const wrongKey = randomBytes(32);
    expect((await reconcileStoredPayment(identity, { key: wrongKey, store, reader, persist })).state).toBe("unknown");
    expect(persist).toHaveBeenCalledTimes(1);
  });
});
