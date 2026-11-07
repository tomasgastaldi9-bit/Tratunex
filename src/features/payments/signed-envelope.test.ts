import { describe, expect, it } from "vitest";
import { randomBytes } from "node:crypto";
import { decryptSignedPayload, encryptSignedPayload } from "./signed-envelope";

describe("protección del pago firmado", () => {
  it("cifra con una clave privada del servidor y permite recuperar con el contexto original", () => {
    const key = randomBytes(32);
    const raw = "0x02abcd";
    const envelope = encryptSignedPayload(raw, key, "reservation-1");
    expect(envelope).not.toContain(raw);
    expect(decryptSignedPayload(envelope, key, "reservation-1")).toBe(raw);
    expect(encryptSignedPayload(raw, key, "reservation-1")).not.toBe(envelope);
  });
  it("rechaza cambios del contexto, el contenido o la clave", () => {
    const key = randomBytes(32);
    const envelope = encryptSignedPayload("0x02abcd", key, "reservation-1");
    expect(() => decryptSignedPayload(envelope, key, "reservation-2")).toThrow();
    expect(() => decryptSignedPayload(envelope, randomBytes(32), "reservation-1")).toThrow();
    const parts = JSON.parse(envelope); parts.ciphertext = "AA==";
    expect(() => decryptSignedPayload(JSON.stringify(parts), key, "reservation-1")).toThrow();
    expect(() => encryptSignedPayload("0x02abcd", randomBytes(16), "reservation-1")).toThrow();
  });
});
