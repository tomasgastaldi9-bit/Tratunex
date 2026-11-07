import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { encodeAbiParameters, encodeEventTopics, keccak256, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { payInvoiceWithPorts } from "./pay-service";
import { submitPreparedPayment } from "./prepared-broadcast";
import { reconcileStoredPayment } from "./reconcile-stored";
import { TRANSFER_EVENT } from "./receipt-check";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import type { PreparedRecord } from "./prepared-payment";

describe("flujo de pago aislado con firma y red ficticias", () => {
  it("reutiliza un intento y no vuelve a transmitir al recuperar", async () => {
    const account = privateKeyToAccount(`0x${"0".repeat(63)}1`), key = randomBytes(32);
    const ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "20000000-0000-4000-8000-000000000001", actor_type: "user" as const, action_id: "original" };
    const order_id = "30000000-0000-4000-8000-000000000001";
    const identity = { id: "40000000-0000-4000-8000-000000000001", companyId: ctx.company_id, orderId: order_id, actionId: ctx.action_id,
      sender: account.address, recipient: "0x0000000000000000000000000000000000000002" as const, amount: BigInt(100), nonce: 7 };
    const limits = { gas: BigInt(100000), maxFeePerGas: BigInt(200000000), maxPriorityFeePerGas: BigInt(100000000), maxTotalFee: BigInt(20000000000000) };
    let record: PreparedRecord | null = null, marked = false, status = "unknown";
    const store = { read: async () => record, write: async (value: PreparedRecord) => { if (record) throw new Error("already prepared"); record = value; } };
    const send = vi.fn(async (raw: Hex) => keccak256(raw));
    const markStarted = vi.fn(async () => { if (marked) return "already_started" as const; marked = true; return "acquired" as const; });
    const blockHash = `0x${"b".repeat(64)}` as Hex;
    const log = { address: TWIN_ARGT_ARBITRUM, topics: encodeEventTopics({ abi: [TRANSFER_EVENT], eventName: "Transfer", args: { from: account.address, to: identity.recipient } }) as [Hex, ...Hex[]], data: encodeAbiParameters([{ type: "uint256" }], [identity.amount]) };
    const reader = { getChainId: async () => 42161, getReceipt: async () => ({ transactionHash: record!.hash, from: account.address, to: TWIN_ARGT_ARBITRUM, status: "success" as const, logs: [log], blockNumber: BigInt(100), blockHash }), getFinalizedBlockNumber: async () => BigInt(100), getBlockHash: async () => blockHash };
    const ports = { verifySession: async () => true, getOrderVersion: async () => 2, getPendingNonce: async () => 7,
      claim: async () => ({ ok: true as const, identity }),
      submit: () => submitPreparedPayment(identity, { key, store, signer: account, limits, markStarted, send }),
      reconcile: () => reconcileStoredPayment(identity, { key, store, reader, persist: async value => { status = value; return value; } }),
      readPayment: async () => ({ id: identity.id, status: status as "confirmed", tx_hash: record!.hash, explorer_url: `https://arbiscan.io/tx/${record!.hash}`, amount_atomic: "100", token: "ARGt" as const, chain: "arbitrum" as const }) };
    const first = await payInvoiceWithPorts(ctx, { order_id }, ports);
    const second = await payInvoiceWithPorts({ ...ctx, action_id: "recovery" }, { order_id }, ports);
    expect(first).toMatchObject({ ok: true, data: { payment: { status: "confirmed" } } });
    expect(second).toEqual(first);
    expect(send).toHaveBeenCalledTimes(1);
    expect(markStarted).toHaveBeenCalledTimes(2);
  });
});
