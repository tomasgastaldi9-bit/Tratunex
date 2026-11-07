import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

function checkInputs(key: Uint8Array, context: string) {
  if (key.length !== 32 || !context || context.length > 512) throw new Error("Configuración de cifrado inválida.");
}
function decode(value: unknown, expectedLength?: number): Buffer {
  if (typeof value !== "string" || !/^[A-Za-z0-9+/]*={0,2}$/.test(value) || value.length > 180000) throw new Error("Sobre de pago inválido.");
  const data = Buffer.from(value, "base64");
  if (data.toString("base64") !== value || (expectedLength !== undefined && data.length !== expectedLength)) throw new Error("Sobre de pago inválido.");
  return data;
}

/** The encrypted result is still sensitive; caller must restrict database access. */
export function encryptSignedPayload(raw: string, key: Uint8Array, context: string): string {
  checkInputs(key, context);
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(raw) || raw.length > 131074) throw new Error("Transacción inválida.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  cipher.setAAD(Buffer.from(context, "utf8"));
  const ciphertext = Buffer.concat([cipher.update(raw, "utf8"), cipher.final()]);
  return JSON.stringify({ version: 1, iv: iv.toString("base64"), ciphertext: ciphertext.toString("base64"), tag: cipher.getAuthTag().toString("base64") });
}

/** A reservation identifier should be included in context and fixed by the server. */
export function decryptSignedPayload(envelope: string, key: Uint8Array, context: string): string {
  checkInputs(key, context);
  if (envelope.length > 180500) throw new Error("Sobre de pago inválido.");
  const obj: unknown = JSON.parse(envelope);
  if (!obj || typeof obj !== "object" || Array.isArray(obj)) throw new Error("Sobre de pago inválido.");
  const item = obj as Record<string, unknown>;
  if (item.version !== 1 || Object.keys(item).sort().join(",") !== "ciphertext,iv,tag,version") throw new Error("Sobre de pago inválido.");
  const decipher = createDecipheriv("aes-256-gcm", key, decode(item.iv, 12));
  decipher.setAAD(Buffer.from(context, "utf8"));
  decipher.setAuthTag(decode(item.tag, 16));
  const raw = Buffer.concat([decipher.update(decode(item.ciphertext)), decipher.final()]).toString("utf8");
  if (!/^0x(?:[0-9a-fA-F]{2})+$/.test(raw) || raw.length > 131074) throw new Error("Transacción inválida.");
  return raw;
}
