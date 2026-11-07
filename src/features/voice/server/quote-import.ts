import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { ActionCtx, Result } from "../../../contracts/common";
import type { SupplierQuoteDTO } from "../../../contracts/voice";
import { extractQuoteFromVapiCall, type QuoteCallExtraction } from "./quote-call";
import { isVapiCallId } from "./vapi-api";

// QUO-02: trae la cotización de una llamada del cotizador y la guarda en
// supplier_quotes. Lee la llamada de la API de Vapi en vez de esperar el
// webhook, así funciona igual si la llamada se hizo desde el dashboard de Vapi.

export const ImportQuoteFromCallInputSchema = z.strictObject({
  provider_call_id: z.string().trim().refine(isVapiCallId, "El ID de la llamada de Vapi no es válido"),
  supplier_contact_id: z.uuid(),
  purchase_request_id: z.uuid(),
});
export type ImportQuoteFromCallInput = z.infer<typeof ImportQuoteFromCallInputSchema>;

export type ImportQuoteFromCallData = { quote: SupplierQuoteDTO; created: boolean };

export type SaveCallQuoteInput = {
  company_id: string;
  supplier_contact_id: string;
  purchase_request_id: string;
  provider_call_id: string;
  transport: "phone" | "web";
  ended_reason: string | null;
  // Clave estable: reintentar con la misma llamada no crea otra fila.
  action_id: string;
  extraction: QuoteCallExtraction;
};

export type QuoteStore = {
  saveCallQuote(input: SaveCallQuoteInput): Promise<Result<ImportQuoteFromCallData>>;
};

export type ImportQuoteDeps = {
  fetchCall: (providerCallId: string) => Promise<Result<unknown>>;
  store: QuoteStore;
};

export function importQuoteActionId(providerCallId: string): string {
  return `voice:import-quote:${providerCallId.toLowerCase()}`;
}

function failure(code: "VALIDATION_ERROR" | "CONFLICT", message: string, retryable: boolean) {
  return { ok: false as const, error: { code, message, retryable } };
}

export async function importQuoteFromCall(
  actionCtx: ActionCtx,
  input: unknown,
  deps: ImportQuoteDeps,
): Promise<Result<ImportQuoteFromCallData>> {
  const parsed = ImportQuoteFromCallInputSchema.safeParse(input);
  if (!parsed.success) {
    return failure("VALIDATION_ERROR", parsed.error.issues[0]?.message ?? "Datos inválidos", false);
  }
  const { provider_call_id: providerCallId, supplier_contact_id, purchase_request_id } = parsed.data;

  const fetched = await deps.fetchCall(providerCallId);
  if (!fetched.ok) return fetched;
  const call = extractQuoteFromVapiCall(fetched.data);
  if (!call.ok) return call;
  if (call.data.provider_call_id.toLowerCase() !== providerCallId.toLowerCase()) {
    return failure("VALIDATION_ERROR", "Vapi devolvió otra llamada", false);
  }
  if (!call.data.ended) {
    return failure("CONFLICT", "La llamada todavía no terminó", true);
  }
  // Vapi genera la cotización unos segundos después de cortar.
  if (!call.data.extraction) {
    return failure("CONFLICT", "Vapi todavía no tiene la cotización de esta llamada: probá de nuevo en unos segundos", true);
  }
  if (!call.data.extraction.spoke_with_person) {
    return failure("VALIDATION_ERROR", "En esa llamada no habló una persona: no hay cotización", false);
  }

  return deps.store.saveCallQuote({
    company_id: actionCtx.company_id,
    supplier_contact_id,
    purchase_request_id,
    provider_call_id: call.data.provider_call_id,
    transport: call.data.transport,
    ended_reason: call.data.ended_reason,
    action_id: importQuoteActionId(providerCallId),
    extraction: call.data.extraction,
  });
}

// ---------------------------------------------------------------------------
// Lectura para el comparador (ORD-02): la forma que propuso Nano en
// src/contracts/supplier-quotes.ts (rama feat/TRA-75-cotizaciones). Cuando ese
// contrato esté en main, este tipo se reemplaza por SupplierQuote.
// ---------------------------------------------------------------------------
export type ComparatorQuoteMoney = { amount_atomic: string; currency: "ARS" | "USD"; decimals: 2 };
export type ComparatorQuoteSource =
  | { kind: "call"; call_id: string; transport: "mock" | "web" | "phone" }
  | { kind: "web"; url: string }
  | { kind: "example"; label: string };

export type ComparatorQuote = Omit<
  SupplierQuoteDTO,
  "unit_price" | "currency" | "price_includes_vat" | "delivery_included" | "source" | "source_url" | "call_id" | "updated_at" | "purchase_request_id"
> & {
  purchase_request_id: string;
  unit_price: ComparatorQuoteMoney | null;
  price_includes_vat: "yes" | "no" | "unknown";
  delivery_included: "yes" | "no" | "unknown";
  source: ComparatorQuoteSource;
};

export const EXAMPLE_QUOTE_LABEL = "Datos de prueba";

// El precio se guarda con 2 decimales; viaja como centavos enteros, sin
// convertir de moneda. Sin moneda conocida no hay precio comparable.
export function toComparatorMoney(unitPrice: number | null, currency: SupplierQuoteDTO["currency"]): ComparatorQuoteMoney | null {
  if (unitPrice === null || (currency !== "ARS" && currency !== "USD")) return null;
  return { amount_atomic: String(Math.round(unitPrice * 100)), currency, decimals: 2 };
}

export function toComparatorQuote(quote: SupplierQuoteDTO, callTransport: "mock" | "web" | "phone" | null): ComparatorQuote | null {
  if (quote.purchase_request_id === null) return null;
  let source: ComparatorQuoteSource;
  if (quote.source === "call") {
    if (quote.call_id === null || callTransport === null) return null;
    source = { kind: "call", call_id: quote.call_id, transport: callTransport };
  } else if (quote.source === "web") {
    if (quote.source_url === null) return null;
    source = { kind: "web", url: quote.source_url };
  } else {
    source = { kind: "example", label: EXAMPLE_QUOTE_LABEL };
  }
  return {
    id: quote.id,
    company_id: quote.company_id,
    purchase_request_id: quote.purchase_request_id,
    supplier_contact_id: quote.supplier_contact_id,
    unit_price: toComparatorMoney(quote.unit_price, quote.currency),
    can_supply: quote.can_supply,
    available_quantity: quote.available_quantity,
    minimum_order_quantity: quote.minimum_order_quantity,
    lead_time_days: quote.lead_time_days,
    lead_time_text: quote.lead_time_text,
    price_includes_vat: quote.price_includes_vat ?? "unknown",
    delivery_included: quote.delivery_included ?? "unknown",
    accepts_argt: quote.accepts_argt,
    payment_terms: quote.payment_terms,
    notes: quote.notes,
    summary: quote.summary,
    source,
    created_at: quote.created_at,
  };
}
