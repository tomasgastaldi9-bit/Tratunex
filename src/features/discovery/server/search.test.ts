import { describe, expect, it } from "vitest";
import { parseSearchInput, parseFirecrawlResults } from "./search";

describe("supplier search", () => {
  it("accepts an item and location and limits results to five", () => {
    expect(parseSearchInput({ query: "  vasos descartables ", location: " Córdoba ", limit: 5 })).toEqual({ query: "vasos descartables", location: "Córdoba", limit: 5 });
    expect(() => parseSearchInput({ query: "", location: "Córdoba", limit: 5 })).toThrow();
    expect(() => parseSearchInput({ query: "vasos", location: "Córdoba", limit: 6 })).toThrow();
  });

  it("returns supplier details only when the exact evidence appears in the source", () => {
    const candidates = parseFirecrawlResults({ success: true, data: { web: [{
      title: "Distribuidora Sol", url: "https://example.com/catalogo",
      markdown: "Distribuidora Sol\nTeléfono: +54 351 456 7890\nVasos descartables premium\nCaja por 500: $12.000",
      json: { company_name: "Distribuidora Sol", is_official_website: true, is_supplier: true,
        product_evidence: ["Vasos descartables premium", "Vasos importados inventados"],
        price_evidence: ["Caja por 500: $12.000", "Unidad: $999"] },
    }, {
      title: "Distribuidora Luna", url: "https://example.org",
      markdown: "Distribuidora Luna\nSin datos de contacto o precios",
      json: { company_name: "Distribuidora Luna", is_official_website: true, is_supplier: true,
        product_evidence: [], price_evidence: [] },
    }, { title: "Inválido", url: "javascript:alert(1)" }] } }, 5);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({
      name: "Distribuidora Sol", phone: "+54 351 456 7890", source_url: "https://example.com/catalogo",
      products: ["Vasos descartables premium"], prices: ["Caja por 500: $12.000"],
    });
    expect(candidates[1]).toMatchObject({ phone: null, source_url: "https://example.org/", products: [], prices: [] });
  });

  it("does not mistake a CUIT for a phone number", () => {
    const candidates = parseFirecrawlResults({ success: true, data: { web: [{ title: "Comercio", url: "https://example.com", markdown: "Comercio\nCUIT 30-12345678-9", json: { company_name: "Comercio", is_official_website: true, is_supplier: true } }] } }, 5);
    expect(candidates[0].phone).toBeNull();
  });

  it("does not turn an article or unsupported name into a supplier", () => {
    expect(parseFirecrawlResults({ success: true, data: { web: [{ title: "Directorio de empresas", url: "https://example.com", markdown: "Listado de empresas", json: { company_name: "Una empresa inventada", is_official_website: true, is_supplier: true } }] } }, 5)).toEqual([]);
  });

  it("rejects a directory page even when a listed supplier and phone appear in its content", () => {
    const results = { success: true, data: { web: [{ title: "Proveedores de Córdoba", url: "https://directory.example/articulo", markdown: "Distribuidora Casa.\nTeléfono: 0351 481-8086", json: { company_name: "Distribuidora Casa", is_official_website: false, is_supplier: true } }] } };
    expect(parseFirecrawlResults(results, 5)).toEqual([]);
  });
});
