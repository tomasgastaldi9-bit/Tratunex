import { describe, expect, it, vi } from "vitest";
import { keccak256, type Hex } from "viem";
import { broadcastOnce } from "./broadcast-once";

const raw = "0x1234" as Hex;
const hash = keccak256(raw);
describe("transmisión con reserva durable", () => {
  it("solo transmite si obtiene la marca durable y verifica el hash de respuesta", async () => {
    const send = vi.fn().mockResolvedValue(hash);
    expect(await broadcastOnce({ raw, hash }, { markStarted: async () => "acquired", send })).toEqual({ state: "submitted" });
    expect(send).toHaveBeenCalledExactlyOnceWith(raw);
  });
  it("nunca transmite cuando la reserva ya se reclamó o el resultado es incierto", async () => {
    const send = vi.fn().mockResolvedValue(hash);
    expect(await broadcastOnce({ raw, hash }, { markStarted: async () => "already_started", send })).toEqual({ state: "unknown" });
    expect(await broadcastOnce({ raw, hash }, { markStarted: async () => { throw new Error("timeout"); }, send })).toEqual({ state: "unknown" });
    expect(send).not.toHaveBeenCalled();
  });
  it("conserva la incertidumbre cuando el envío falla o devuelve otro hash", async () => {
    expect(await broadcastOnce({ raw, hash }, { markStarted: async () => "acquired", send: async () => { throw new Error("timeout"); } })).toEqual({ state: "unknown" });
    expect(await broadcastOnce({ raw, hash }, { markStarted: async () => "acquired", send: async () => `0x${"b".repeat(64)}` })).toEqual({ state: "unknown" });
  });
  it("no adquiere ni transmite bytes que no coinciden con el hash persistido", async () => {
    const markStarted = vi.fn().mockResolvedValue("acquired");
    const send = vi.fn().mockResolvedValue(hash);
    expect(await broadcastOnce({ raw: "0x1235", hash }, { markStarted, send })).toEqual({ state: "unknown" });
    expect(markStarted).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});
