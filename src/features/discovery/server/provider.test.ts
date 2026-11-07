import { describe, expect, it, vi } from "vitest";
import { searchProvider } from "./provider";

describe("provider", () => {
  it("does not fall back to mock when live key is missing", async () => {
    expect(await searchProvider({ query: "panadería", location: "Córdoba", limit: 5 }, "live", undefined)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
  it("returns an explicit error when Firecrawl rejects the request", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("quota", { status: 429 }));
    expect(await searchProvider({ query: "panadería", location: "Córdoba", limit: 5 }, "live", "test", fetcher)).toMatchObject({ ok: false, error: { code: "RATE_LIMITED" } });
  });
  it("returns provider candidates with their source when the request succeeds", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, data: { web: [{ title: "Distribuidora Comercio", url: "https://example.com/contact", markdown: "Distribuidora Comercio\nTeléfono: +54 351 456 7890\nVasos de polipropileno", json: { company_name: "Distribuidora Comercio", is_official_website: true, is_supplier: true, product_evidence: ["Vasos de polipropileno"], price_evidence: [] } }] } }));
    const result = await searchProvider({ query: "comercio", location: "Córdoba", limit: 5 }, "live", "test", fetcher);
    expect(result).toMatchObject({ ok: true, data: [{ name: "Distribuidora Comercio", source_url: "https://example.com/contact", phone: "+54 351 456 7890", products: ["Vasos de polipropileno"], prices: [] }] });
    expect(JSON.parse(fetcher.mock.calls[0][1]?.body as string).query).toContain("proveedor mayorista comercio Córdoba");
  });
  it("reports malformed provider data instead of returning mock results", async () => {
    const fetcher = vi.fn().mockResolvedValue(Response.json({ success: true, data: { web: "invalid" } }));
    expect(await searchProvider({ query: "comercio", location: "Córdoba", limit: 5 }, "live", "test", fetcher)).toMatchObject({ ok: false });
  });});
