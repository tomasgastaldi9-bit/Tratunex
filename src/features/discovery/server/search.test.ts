import { describe, expect, it } from "vitest";
import { parseSearchInput, parseFirecrawlResults } from "./search";

describe("prospect search", () => {
  it("accepts a specific search and limits results to five", () => {
    expect(parseSearchInput({ query: "  panaderías ", location: " Córdoba ", limit: 5 })).toEqual({ query: "panaderías", location: "Córdoba", limit: 5 });
    expect(() => parseSearchInput({ query: "", location: "Córdoba", limit: 5 })).toThrow();
    expect(() => parseSearchInput({ query: "panaderías", location: "Córdoba", limit: 6 })).toThrow();
  });
  it("retains a verified source and marks an absent phone", () => {
    const candidates = parseFirecrawlResults({ success: true, data: { web: [{ title: "Panadería Sol", url: "https://example.com/contacto", markdown: "Panadería Sol. Teléfono: +54 351 456 7890", json: { company_name: "Panadería Sol" } }, { title: "Panadería Luna", url: "https://example.org", markdown: "Panadería Luna. Sin datos", json: { company_name: "Panadería Luna" } }, { title: "Inválido", url: "javascript:alert(1)" }] } }, 5);
    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ name: "Panadería Sol", phone: "+54 351 456 7890", source_url: "https://example.com/contacto" });
    expect(candidates[1]).toMatchObject({ phone: null, source_url: "https://example.org/" });
  });
  it("does not mistake a CUIT for a phone number", () => {
    const candidates = parseFirecrawlResults({ success: true, data: { web: [{ title: "Comercio", url: "https://example.com", markdown: "Comercio. CUIT 30-12345678-9", json: { company_name: "Comercio" } }] } }, 5);
    expect(candidates[0].phone).toBeNull();
  });  it("does not turn an article or unsupported name into a business", () => {
    expect(parseFirecrawlResults({ success: true, data: { web: [{ title: "Directorio de empresas", url: "https://example.com", markdown: "Listado de empresas", json: { company_name: "Una empresa inventada" } }] } }, 5)).toEqual([]);
  });});
