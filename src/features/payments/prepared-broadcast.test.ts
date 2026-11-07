import { randomBytes } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";
import { submitPreparedPayment } from "./prepared-broadcast";
import type { PreparedRecord } from "./prepared-payment";
import { prepareSignedPayment } from "./prepared-payment";
import { signPayment } from "./sign-payment";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const identity = { id: "reservation", companyId: "company", orderId: "order", actionId: "action", sender: account.address, recipient: "0x0000000000000000000000000000000000000002" as const, amount: BigInt(100), nonce: 4 };
const limits = { gas: BigInt(100000), maxFeePerGas: BigInt(200000000), maxPriorityFeePerGas: BigInt(100000000), maxTotalFee: BigInt(20000000000000) };
const key = randomBytes(32);
describe("preparar y transmitir", () => {
  it("persiste cifrado antes de enviar y no vuelve a firmar ni enviar al reintentar", async () => {
    let record: PreparedRecord | null = null, marked = false;
    const store = { read: async () => record, write: async (value: PreparedRecord) => { if (record) throw new Error("already stored"); record = value; } };
    const signTransaction = vi.fn(account.signTransaction);
    const send = vi.fn(async (raw: Hex) => { expect(record).not.toBeNull(); const { keccak256 } = await import("viem"); return keccak256(raw); });
    const markStarted = vi.fn(async () => { if (marked) return "already_started" as const; marked = true; return "acquired" as const; });
    const deps = { key, store, signer: { address: account.address, signTransaction }, limits, markStarted, send };
    const first = await submitPreparedPayment(identity, deps);
    expect(first.state).toBe("submitted");
    const second = await submitPreparedPayment(identity, deps);
    expect(second).toMatchObject({ state: "unknown", hash: first.hash });
    expect(signTransaction).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(first)).not.toContain("raw");
  });
  it("no transmite si no se puede verificar que la firma quedó guardada", async () => {
    const send = vi.fn();
    const store = { read: async () => null, write: async () => { throw new Error("ambiguous"); } };
    expect((await submitPreparedPayment(identity, { key, store, signer: account, limits, markStarted: async () => "acquired", send })).state).toBe("unknown");
    expect(send).not.toHaveBeenCalled();
  });
  it("no transmite de nuevo si la red aceptó el envío pero la respuesta se perdió", async () => {
    let record: PreparedRecord | null = null, marked = false;
    const store = { read: async () => record, write: async (value: PreparedRecord) => { record = value; } };
    const markStarted = vi.fn(async () => { if (marked) return "already_started" as const; marked = true; return "acquired" as const; });
    const send = vi.fn(async () => { throw new Error("timeout"); });
    const deps = { key, store, signer: account, limits, markStarted, send };
    const first = await submitPreparedPayment(identity, deps);
    const retry = await submitPreparedPayment(identity, deps);
    expect(first.state).toBe("unknown");
    expect(retry).toEqual(first);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("ante solicitudes simultáneas transmite como máximo una vez", async () => {
    let record: PreparedRecord | null = null, marked = false;
    const store = { read: async () => record, write: async (value: PreparedRecord) => { if (record) throw new Error("already prepared"); record = value; } };
    const markStarted = vi.fn(async () => { if (marked) return "already_started" as const; marked = true; return "acquired" as const; });
    const send = vi.fn(async (raw: Hex) => { const { keccak256 } = await import("viem"); return keccak256(raw); });
    const deps = { key, store, signer: account, limits, markStarted, send };
    const results = await Promise.all([submitPreparedPayment(identity, deps), submitPreparedPayment(identity, deps)]);
    expect(results.filter(result => result.state === "submitted")).toHaveLength(1);
    expect(send).toHaveBeenCalledTimes(1);
  });
  it("no transmite una firma guardada si excede el límite actual", async () => {
    let record: PreparedRecord | null = null;
    const store = { read: async () => record, write: async (value: PreparedRecord) => { record = value; } };
    const signed = await signPayment(identity, limits, account);
    if (!signed.ok) throw new Error("fixture signing failed");
    expect((await prepareSignedPayment(identity, signed.raw, key, store)).ok).toBe(true);
    const send = vi.fn(), markStarted = vi.fn();
    const result = await submitPreparedPayment(identity, { key, store, signer: account, limits: { ...limits, maxTotalFee: BigInt(1) }, markStarted, send });
    expect(result.state).toBe("unknown");
    expect(markStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
