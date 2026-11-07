import { describe, expect, it, vi } from "vitest";
import { BELO_PRICE_URL, beloEquivalent, fetchBeloPrice } from "./belo-price";

// Recorte real de https://api.belo.app/public/price (7/11/2026 15:08).
const beloBody = [
  { ask: "126542642.44999999998", bid: "122910588.78119999998", baseId: "3", quoteId: "2", pairCode: "BTC/ARS", spread: "2.87" },
  { ask: "1651.9999999999999998", bid: "1636.9999999999999998", baseId: "6", quoteId: "2", pairCode: "USDT/ARS", spread: "0.90" },
  { ask: "1656.1986571199999997", bid: "1636.2280808349999998", baseId: "7", quoteId: "2", pairCode: "USDC/ARS", spread: "1.20" },
];
const now = () => new Date("2026-11-07T18:08:00.000Z");
const json = (body: unknown, status = 200) => async () => new Response(JSON.stringify(body), { status });

describe("fetchBeloPrice", () => {
  it("lee bid y ask del par, calcula el medio y anota la hora de la consulta", async () => {
    const fetchImpl = vi.fn(json(beloBody));
    const result = await fetchBeloPrice("USDT/ARS", { fetchImpl, now });
    expect(fetchImpl).toHaveBeenCalledWith(BELO_PRICE_URL, expect.anything());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.pair).toBe("USDT/ARS");
    expect(result.data.bid).toBeCloseTo(1637, 6);
    expect(result.data.ask).toBeCloseTo(1652, 6);
    expect(result.data.mid).toBeCloseTo(1644.5, 6);
    expect(result.data.fetched_at).toBe("2026-11-07T18:08:00.000Z");
  });

  it("un par que Belo no publica o un precio inválido es un error del proveedor", async () => {
    const missing = await fetchBeloPrice("USDT/ARS", { fetchImpl: json([beloBody[0]]), now });
    expect(missing).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR", retryable: false } });
    const broken = await fetchBeloPrice("USDT/ARS", { fetchImpl: json([{ ...beloBody[1], bid: "abc" }]), now });
    expect(broken).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    const inverted = await fetchBeloPrice("USDT/ARS", { fetchImpl: json([{ ...beloBody[1], bid: "1700" }]), now });
    expect(inverted).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    const shape = await fetchBeloPrice("USDT/ARS", { fetchImpl: json({ prices: [] }), now });
    expect(shape).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });

  it("si Belo no responde, se puede reintentar", async () => {
    const down = await fetchBeloPrice("USDT/ARS", { fetchImpl: async () => { throw new Error("red"); }, now });
    expect(down).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    const error503 = await fetchBeloPrice("USDT/ARS", { fetchImpl: json({}, 503), now });
    expect(error503).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
  });
});

describe("beloEquivalent", () => {
  const price = { pair: "USDT/ARS" as const, bid: 1637, ask: 1652, mid: 1644.5, fetched_at: "2026-11-07T18:08:00.000Z" };

  it("pasa pesos a USDT y USD a pesos con el precio medio", () => {
    expect(beloEquivalent(5000, "ARS", price).usdt).toBeCloseTo(3.0404, 4);
    expect(beloEquivalent(5000, "ARS", price).ars).toBe(5000);
    expect(beloEquivalent(2, "USD", price)).toEqual({ ars: 3289, usdt: 2 });
  });
});
