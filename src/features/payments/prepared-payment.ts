import type { Address, Hex } from "viem";
import type { Result } from "../../contracts/common";
import { encryptSignedPayload, decryptSignedPayload } from "./signed-envelope";
import { inspectSignedTransfer } from "./signed-transfer";

export type PreparedIdentity = { id: string; companyId: string; orderId: string; actionId: string; sender: Address; recipient: Address; amount: bigint; nonce: number };
export type PreparedRecord = { id: string; hash: Hex; envelope: string };
export type PreparedStore = { read: () => Promise<PreparedRecord | null>; write: (record: PreparedRecord) => Promise<void> };

const uncertain = (): Result<never> => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo confirmar el guardado. Consultá el estado con la misma acción.", retryable: true } });
const conflict = (): Result<never> => ({ ok: false, error: { code: "CONFLICT", message: "Los datos de la transacción no coinciden con la reserva.", retryable: false } });
const contextFor = (identity: PreparedIdentity) => JSON.stringify(["tratunex-payment-v1", identity.companyId, identity.orderId, identity.id, identity.actionId]);

/** Server-internal only: the returned raw transaction can be broadcast. Never expose it to a browser or logs. */
export async function recoverSignedPayment(identity: PreparedIdentity, key: Uint8Array, store: PreparedStore): Promise<Result<{ hash: Hex; raw: Hex }>> {
  if (!identity.id || !identity.companyId || !identity.orderId || !identity.actionId || key.length !== 32) return conflict();
  let record: PreparedRecord | null;
  try { record = await store.read(); } catch { return uncertain(); }
  if (!record) return { ok: false, error: { code: "NOT_FOUND", message: "No hay una transacción preparada para esta reserva.", retryable: false } };
  try {
    if (record.id !== identity.id) return conflict();
    const raw = decryptSignedPayload(record.envelope, key, contextFor(identity)) as Hex;
    const inspected = await inspectSignedTransfer(raw, identity);
    if (!inspected.ok || inspected.hash.toLowerCase() !== record.hash.toLowerCase()) return conflict();
    return { ok: true, data: { hash: inspected.hash, raw } };
  } catch { return conflict(); }
}

/** Internal preparation only: caller must authorize and lock the order and policy before any signing or broadcasting. */
export async function prepareSignedPayment(identity: PreparedIdentity, raw: Hex, key: Uint8Array, store: PreparedStore): Promise<Result<{ hash: Hex }>> {
  const inspected = await inspectSignedTransfer(raw, identity);
  if (!inspected.ok || !identity.id || !identity.companyId || !identity.orderId || !identity.actionId || key.length !== 32) return conflict();
  const expectedHash = inspected.hash;
  const context = contextFor(identity);
  async function verifyStored(record: PreparedRecord): Promise<Result<{ hash: Hex }>> {
    try {
      if (record.id !== identity.id || record.hash.toLowerCase() !== expectedHash.toLowerCase()) return conflict();
      const recovered = decryptSignedPayload(record.envelope, key, context) as Hex;
      const verified = await inspectSignedTransfer(recovered, identity);
      if (!verified.ok || verified.hash.toLowerCase() !== expectedHash.toLowerCase() || recovered.toLowerCase() !== raw.toLowerCase()) return conflict();
      return { ok: true, data: { hash: verified.hash } };
    } catch { return conflict(); }
  }
  let existing: PreparedRecord | null;
  try { existing = await store.read(); } catch { return uncertain(); }
  if (existing) return verifyStored(existing);
  let envelope: string;
  try { envelope = encryptSignedPayload(raw, key, context); } catch { return conflict(); }
  try { await store.write({ id: identity.id, hash: expectedHash, envelope }); } catch { /* Resolve ambiguous writes only by reading durable state. */ }
  try {
    const saved = await store.read();
    return saved ? verifyStored(saved) : uncertain();
  } catch { return uncertain(); }
}
