import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { encodeFunctionData, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { TWIN_ARGT_ARBITRUM } from "./wallet-check";
import { prepareSignedPayment, recoverSignedPayment } from "./prepared-payment";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const recipient = "0x0000000000000000000000000000000000000002" as const;
const identity = { id: "reservation-1", companyId: "company-1", orderId: "order-1", actionId: "action-1", sender: account.address, recipient, amount: BigInt(100), nonce: 4 };
const abi = parseAbi(["function transfer(address to, uint256 amount) returns (bool)"]);
const data = encodeFunctionData({ abi, functionName: "transfer", args: [recipient, BigInt(100)] });
const key = randomBytes(32);
const sign = (nonce = 4) => account.signTransaction({ chainId: 42161, type: "eip1559", nonce, to: TWIN_ARGT_ARBITRUM, data, gas: BigInt(100000), maxFeePerGas: BigInt(1000000000), maxPriorityFeePerGas: BigInt(100000000), value: BigInt(0) });

describe("persistencia de pago preparado", () => {
  it("persiste solo el sobre cifrado y recupera el mismo hash al repetir", async () => {
    const raw = await sign(); let stored: { id: string; hash: `0x${string}`; envelope: string } | null = null;
    const store = { read: async () => stored, write: async (value: NonNullable<typeof stored>) => { stored = value; } };
    const first = await prepareSignedPayment(identity, raw, key, store);
    const second = await prepareSignedPayment(identity, raw, key, store);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true });
    expect(await recoverSignedPayment(identity, key, store)).toMatchObject({ ok: true, data: { raw } });
    expect(JSON.stringify(stored)).not.toContain(raw);
    expect(JSON.stringify(first)).not.toContain(raw);
  });
  it("recupera un guardado si la respuesta se perdió y rechaza un sobre de otra reserva", async () => {
    const raw = await sign(); let stored: { id: string; hash: `0x${string}`; envelope: string } | null = null;
    const store = { read: async () => stored, write: async (value: NonNullable<typeof stored>) => { stored = value; throw new Error("timeout"); } };
    expect(await prepareSignedPayment(identity, raw, key, store)).toMatchObject({ ok: true });
    const otherIdentity = { ...identity, id: "other-reservation" };
    expect(await prepareSignedPayment(otherIdentity, raw, key, store)).toMatchObject({ ok: false });
    expect(await recoverSignedPayment(otherIdentity, key, store)).toMatchObject({ ok: false });
    expect(await recoverSignedPayment({ ...identity, actionId: "other" }, key, store)).toMatchObject({ ok: false });
  });
  it("no guarda una firma con nonce distinto y no confirma un resultado desconocido", async () => {
    let writes = 0;
    const store = { read: async () => null, write: async () => { writes++; throw new Error("desconocido"); } };
    expect(await prepareSignedPayment(identity, await sign(5), key, store)).toMatchObject({ ok: false });
    expect(writes).toBe(0);
    expect(await prepareSignedPayment(identity, await sign(), key, store)).toMatchObject({ ok: false, error: { retryable: true } });
  });
  it("no reemplaza una transacción preparada aunque use la misma reserva", async () => {
    const raw = await sign(); let stored: { id: string; hash: `0x${string}`; envelope: string } | null = null;
    let writes = 0;
    const store = { read: async () => stored, write: async (value: NonNullable<typeof stored>) => { writes++; stored = value; } };
    expect(await prepareSignedPayment(identity, raw, key, store)).toMatchObject({ ok: true });
    const replacement = await account.signTransaction({ chainId: 42161, type: "eip1559", nonce: 4, to: TWIN_ARGT_ARBITRUM, data, gas: BigInt(120000), maxFeePerGas: BigInt(1000000000), maxPriorityFeePerGas: BigInt(100000000), value: BigInt(0) });
    expect(await prepareSignedPayment(identity, replacement, key, store)).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(writes).toBe(1);
  });
});
