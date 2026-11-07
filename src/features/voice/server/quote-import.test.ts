import { describe, expect, it, vi } from "vitest";
import type { ActionCtx, Result } from "../../../contracts/common";
import { supplierQuoteFixtures } from "../fixtures";
import { QUOTE_OUTPUT_NAME, extractQuoteFromVapiCall } from "./quote-call";
import {
  EXAMPLE_QUOTE_LABEL,
  importQuoteActionId,
  importQuoteFromCall,
  toComparatorMoney,
  toComparatorQuote,
  type ImportQuoteFromCallData,
  type SaveCallQuoteInput,
} from "./quote-import";
import { fetchVapiCall } from "./vapi-api";

const vapiCallId = "01a1b71c-99fc-7001-8c19-198725407098";
const supplier = "33333333-3333-4333-8333-333333333333";
const purchase = "77777777-7777-4777-8777-777777777777";
const actionCtx: ActionCtx = {
  company_id: "11111111-1111-4111-8111-111111111111",
  actor_type: "user",
  actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  action_id: "form-1",
};
const extraction = {
  spoke_with_person: true,
  can_supply: "yes",
  unit_price: 85,
  currency: "ARS",
  price_includes_vat: "no",
  available_quantity: 2000,
  minimum_order_quantity: -1,
  lead_time_days: 2,
  lead_time_text: "en 2 días",
  delivery_included: "yes",
  accepts_argt: "yes",
  payment_terms: "",
  do_not_contact_requested: false,
  notes: "",
  summary: "Tiene 2.000 vasos a $85 más IVA y acepta ARGt.",
};

function vapiCall(overrides: Record<string, unknown> = {}) {
  return {
    id: vapiCallId,
    type: "outboundPhoneCall",
    status: "ended",
    endedReason: "assistant-ended-call",
    artifact: { structuredOutputs: { "d3c1": { name: QUOTE_OUTPUT_NAME, result: extraction } } },
    ...overrides,
  };
}

function deps(call: unknown) {
  const saved: SaveCallQuoteInput[] = [];
  const store = {
    saveCallQuote: vi.fn(async (input: SaveCallQuoteInput): Promise<Result<ImportQuoteFromCallData>> => {
      saved.push(input);
      return { ok: true, data: { quote: supplierQuoteFixtures[0], created: true } };
    }),
  };
  return { saved, store, deps: { fetchCall: vi.fn(async () => ({ ok: true as const, data: call })), store } };
}

const input = { provider_call_id: vapiCallId, supplier_contact_id: supplier, purchase_request_id: purchase };

describe("extractQuoteFromVapiCall", () => {
  it("lee la cotización, si terminó y si fue por teléfono o web", () => {
    const phone = extractQuoteFromVapiCall(vapiCall());
    expect(phone.ok && phone.data).toMatchObject({ ended: true, transport: "phone", extraction: { unit_price: 85 } });
    const web = extractQuoteFromVapiCall(vapiCall({ type: "webCall", status: "in-progress", artifact: {} }));
    expect(web.ok && web.data).toMatchObject({ ended: false, transport: "web", extraction: null });
  });
});

describe("importQuoteFromCall", () => {
  it("guarda la cotización con la empresa de la sesión y una clave estable por llamada", async () => {
    const { saved, deps: d } = deps(vapiCall());
    const result = await importQuoteFromCall(actionCtx, input, d);
    expect(result.ok).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      company_id: actionCtx.company_id,
      supplier_contact_id: supplier,
      purchase_request_id: purchase,
      provider_call_id: vapiCallId,
      transport: "phone",
      action_id: importQuoteActionId(vapiCallId),
    });
    // -1 y texto vacío llegan como "sin dato".
    expect(saved[0].extraction.minimum_order_quantity).toBeUndefined();
    expect(saved[0].extraction.notes).toBeUndefined();
  });

  it("no acepta company_id ni otros campos en el input", async () => {
    const { deps: d } = deps(vapiCall());
    const result = await importQuoteFromCall(actionCtx, { ...input, company_id: "22222222-2222-4222-8222-222222222222" }, d);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(d.fetchCall).not.toHaveBeenCalled();
  });

  it("rechaza un ID de llamada que no es de Vapi sin consultar nada", async () => {
    const { deps: d } = deps(vapiCall());
    const result = await importQuoteFromCall(actionCtx, { ...input, provider_call_id: "../../account" }, d);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(d.fetchCall).not.toHaveBeenCalled();
  });

  it("si la llamada no terminó o Vapi todavía no extrajo, pide reintentar sin guardar", async () => {
    for (const call of [vapiCall({ status: "in-progress" }), vapiCall({ artifact: { structuredOutputs: {} } })]) {
      const { store, deps: d } = deps(call);
      const result = await importQuoteFromCall(actionCtx, input, d);
      expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT", retryable: true } });
      expect(store.saveCallQuote).not.toHaveBeenCalled();
    }
  });

  it("sin una persona del otro lado no hay cotización", async () => {
    const { store, deps: d } = deps(vapiCall({ artifact: { structuredOutputs: { x: { name: QUOTE_OUTPUT_NAME, result: { ...extraction, spoke_with_person: false } } } } }));
    const result = await importQuoteFromCall(actionCtx, input, d);
    expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    expect(store.saveCallQuote).not.toHaveBeenCalled();
  });

  it("si Vapi devuelve otra llamada, no guarda", async () => {
    const { store, deps: d } = deps(vapiCall({ id: "02a1b71c-99fc-7001-8c19-198725407098" }));
    expect((await importQuoteFromCall(actionCtx, input, d)).ok).toBe(false);
    expect(store.saveCallQuote).not.toHaveBeenCalled();
  });

  it("propaga el error de Vapi tal cual", async () => {
    const { store } = deps(null);
    const result = await importQuoteFromCall(actionCtx, input, {
      store,
      fetchCall: async () => ({ ok: false, error: { code: "NOT_FOUND", message: "Vapi no tiene una llamada con ese ID", retryable: false } }),
    });
    expect(result).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
});

describe("fetchVapiCall", () => {
  const response = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status });

  it("pide la llamada con la clave del servidor", async () => {
    const fetchImpl = vi.fn(async () => response(200, { id: vapiCallId }));
    const result = await fetchVapiCall(vapiCallId, { apiKey: "clave-de-prueba", fetchImpl });
    expect(result).toEqual({ ok: true, data: { id: vapiCallId } });
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.vapi.ai/call/${vapiCallId}`, expect.objectContaining({ headers: { Authorization: "Bearer clave-de-prueba" } }));
  });

  it("traduce cada respuesta a un código claro", async () => {
    const cases: [number, string, boolean][] = [[404, "NOT_FOUND", false], [401, "PROVIDER_ERROR", false], [429, "RATE_LIMITED", true], [503, "PROVIDER_UNAVAILABLE", true]];
    for (const [status, code, retryable] of cases) {
      const result = await fetchVapiCall(vapiCallId, { apiKey: "k", fetchImpl: async () => response(status) });
      expect(result, String(status)).toMatchObject({ ok: false, error: { code, retryable } });
    }
    const down = await fetchVapiCall(vapiCallId, { apiKey: "k", fetchImpl: async () => { throw new Error("red"); } });
    expect(down).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
  });
});

describe("lectura para el comparador", () => {
  const [callQuote, exampleQuote] = supplierQuoteFixtures;

  it("el precio viaja en centavos enteros, sin convertir de moneda", () => {
    expect(toComparatorMoney(85, "ARS")).toEqual({ amount_atomic: "8500", currency: "ARS", decimals: 2 });
    expect(toComparatorMoney(1500.5, "USD")).toEqual({ amount_atomic: "150050", currency: "USD", decimals: 2 });
    expect(toComparatorMoney(0.29, "ARS")?.amount_atomic).toBe("29");
    expect(toComparatorMoney(85, "unknown")).toBeNull();
    expect(toComparatorMoney(null, "ARS")).toBeNull();
  });

  it("arma el origen de cada cotización", () => {
    expect(toComparatorQuote(callQuote, "phone")?.source).toEqual({ kind: "call", call_id: callQuote.call_id, transport: "phone" });
    expect(toComparatorQuote(exampleQuote, null)?.source).toEqual({ kind: "example", label: EXAMPLE_QUOTE_LABEL });
    const web = { ...exampleQuote, source: "web" as const, source_url: "https://proveedor.example/vasos" };
    expect(toComparatorQuote(web, null)?.source).toEqual({ kind: "web", url: "https://proveedor.example/vasos" });
  });

  it("lo desconocido queda unknown o null, nunca inventado", () => {
    const quote = toComparatorQuote({ ...exampleQuote, price_includes_vat: null, delivery_included: null, unit_price: null }, null);
    expect(quote).toMatchObject({ price_includes_vat: "unknown", delivery_included: "unknown", unit_price: null });
    expect(toComparatorQuote({ ...exampleQuote, purchase_request_id: null }, null)).toBeNull();
  });
});
