import { describe, expect, it, vi } from "vitest";
import { privateKeyToAccount } from "viem/accounts";
import { inspectSignedTransfer } from "./signed-transfer";
import { signPayment, verifyPaymentFees } from "./sign-payment";

const account = privateKeyToAccount(`0x${"0".repeat(63)}1`);
const identity = { sender: account.address, recipient: "0x0000000000000000000000000000000000000002" as const, amount: BigInt(100), nonce: 4 };
const limits = { gas: BigInt(100000), maxFeePerGas: BigInt(200000000), maxPriorityFeePerGas: BigInt(100000000), maxTotalFee: BigInt(20000000000000) };
describe("firma de pago", () => {
  it("acepta una comisión de prioridad cero y verifica el límite recuperado", async () => {
    const zeroPriority = { ...limits, maxPriorityFeePerGas: BigInt(0) };
    const result = await signPayment({ ...identity, nonce: 0 }, zeroPriority, account);
    expect(result.ok).toBe(true);
    if (result.ok) expect(verifyPaymentFees(result.raw, zeroPriority)).toBe(true);
  });
  it("rechaza una comisión positiva cuando el límite autorizado es cero", async () => {
    const signed = await signPayment(identity, limits, account);
    expect(signed.ok).toBe(true);
    if (signed.ok) expect(verifyPaymentFees(signed.raw, { ...limits, maxPriorityFeePerGas: BigInt(0) })).toBe(false);
  });
  it("firma solamente la transferencia de la reserva, dentro del límite de gas", async () => {
    const result = await signPayment(identity, limits, account);
    expect(result.ok).toBe(true);
    if (result.ok) expect(await inspectSignedTransfer(result.raw, identity)).toMatchObject({ ok: true });
  });
  it("rechaza un límite insuficiente o emisor distinto antes de firmar", async () => {
    const signer = { address: account.address, signTransaction: vi.fn(account.signTransaction) };
    expect((await signPayment(identity, { ...limits, maxTotalFee: BigInt(1) }, signer)).ok).toBe(false);
    expect((await signPayment({ ...identity, sender: identity.recipient }, limits, signer)).ok).toBe(false);
    expect(signer.signTransaction).not.toHaveBeenCalled();
  });
  it("no retorna una transacción adulterada por el firmador", async () => {
    const signer = { address: account.address, signTransaction: vi.fn().mockResolvedValue("0x1234") };
    expect((await signPayment(identity, limits, signer)).ok).toBe(false);
  });
  it("rechaza la firma si el firmador cambia el gas aprobado", async () => {
    const signer = { address: account.address, signTransaction: async (tx: Parameters<Parameters<typeof signPayment>[2]["signTransaction"]>[0]) => account.signTransaction({ ...tx, gas: tx.gas + BigInt(1) }) };
    expect((await signPayment(identity, limits, signer)).ok).toBe(false);
  });
});
