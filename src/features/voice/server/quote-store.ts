import type { SupabaseClient } from "@supabase/supabase-js";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { Ctx, Result } from "../../../contracts/common";
import { SupplierQuoteDTOSchema, type SupplierQuoteDTO } from "../../../contracts/voice";
import { toComparatorQuote, type ComparatorQuote, type QuoteStore } from "./quote-import";
import type { DialStore } from "./quote-dial";

// supplier_quotes en Supabase. Escribir necesita la clave secreta (los miembros
// solo leen); leer usa la sesión del usuario y RLS.

const QUOTE_COLUMNS =
  "id, company_id, purchase_request_id, supplier_contact_id, call_id, source, source_url, can_supply, unit_price, currency, price_includes_vat, available_quantity, minimum_order_quantity, lead_time_days, lead_time_text, delivery_included, accepts_argt, payment_terms, notes, summary, created_at, updated_at";

type DbError = { code?: string; message: string } | null;

function unavailable(): Extract<Result<never>, { ok: false }> {
  return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "La base de datos no respondió", retryable: true } };
}

// Postgres devuelve numeric como texto o número y fechas con "+00:00".
export function rowToQuoteDTO(row: Record<string, unknown>): Result<SupplierQuoteDTO> {
  const iso = (value: unknown) => (typeof value === "string" ? new Date(value).toISOString() : value);
  const parsed = SupplierQuoteDTOSchema.safeParse({
    ...row,
    unit_price: row.unit_price === null || row.unit_price === undefined ? null : Number(row.unit_price),
    created_at: iso(row.created_at),
    updated_at: iso(row.updated_at),
  });
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, error: { code: "PROVIDER_ERROR", message: "Una cotización guardada no cumple el contrato", retryable: false } };
}

function writeError(error: DbError): Extract<Result<never>, { ok: false }> {
  // 23503: el proveedor o la compra no existen o son de otra empresa.
  if (error?.code === "23503") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "El proveedor o la compra no son de tu empresa", retryable: false } };
  }
  return unavailable();
}

export function createSupabaseQuoteStore(db: SupabaseClient): QuoteStore {
  return {
    async saveCallQuote(input) {
      // 1. La llamada: una fila por ID de Vapi (ON CONFLICT DO NOTHING).
      const callUpsert = await db.from("calls").upsert(
        {
          company_id: input.company_id,
          contact_id: input.supplier_contact_id,
          action_id: input.action_id,
          provider: "vapi",
          provider_call_id: input.provider_call_id,
          transport: input.transport,
          status: "completed",
          ended_reason: input.ended_reason,
          objective: "Cotización de proveedor",
        },
        { onConflict: "provider,provider_call_id", ignoreDuplicates: true },
      );
      if (callUpsert.error) return writeError(callUpsert.error);

      const call = await db
        .from("calls")
        .select("id, company_id, contact_id")
        .eq("provider", "vapi")
        .eq("provider_call_id", input.provider_call_id)
        .maybeSingle();
      if (call.error || !call.data) return unavailable();
      if (call.data.company_id !== input.company_id) {
        return { ok: false, error: { code: "FORBIDDEN", message: "Esa llamada ya está asociada a otra empresa", retryable: false } };
      }
      if (call.data.contact_id !== input.supplier_contact_id) {
        return { ok: false, error: { code: "CONFLICT", message: "Esa llamada ya está asociada a otro proveedor", retryable: false } };
      }

      // 2. La cotización: una por llamada (ON CONFLICT DO NOTHING).
      const e = input.extraction;
      const quoteInsert = await db
        .from("supplier_quotes")
        .upsert(
          {
            company_id: input.company_id,
            purchase_request_id: input.purchase_request_id,
            supplier_contact_id: input.supplier_contact_id,
            call_id: call.data.id,
            source: "call",
            can_supply: e.can_supply,
            unit_price: e.unit_price ?? null,
            currency: e.currency ?? null,
            price_includes_vat: e.price_includes_vat ?? null,
            available_quantity: e.available_quantity ?? null,
            minimum_order_quantity: e.minimum_order_quantity ?? null,
            lead_time_days: e.lead_time_days ?? null,
            lead_time_text: e.lead_time_text ?? null,
            delivery_included: e.delivery_included ?? null,
            accepts_argt: e.accepts_argt,
            payment_terms: e.payment_terms ?? null,
            notes: e.notes ?? null,
            summary: e.summary,
          },
          { onConflict: "call_id", ignoreDuplicates: true },
        )
        .select("id");
      if (quoteInsert.error) return writeError(quoteInsert.error);
      const created = (quoteInsert.data?.length ?? 0) > 0;

      const saved = await db.from("supplier_quotes").select(QUOTE_COLUMNS).eq("call_id", call.data.id).maybeSingle();
      if (saved.error || !saved.data) return unavailable();
      if (saved.data.purchase_request_id !== input.purchase_request_id) {
        return { ok: false, error: { code: "CONFLICT", message: "Esa llamada ya cargó una cotización para otra compra", retryable: false } };
      }
      const quote = rowToQuoteDTO(saved.data);
      return quote.ok ? { ok: true, data: { quote: quote.data, created } } : quote;
    },
  };
}

// Cotizaciones de una compra para el comparador, con la sesión del usuario.
export async function listComparatorQuotes(
  db: SupabaseClient,
  ctx: Ctx,
  purchaseRequestId: string,
): Promise<Result<{ items: ComparatorQuote[] }>> {
  const { data, error } = await db
    .from("supplier_quotes")
    .select(`${QUOTE_COLUMNS}, call:calls(transport)`)
    .eq("company_id", ctx.company_id)
    .eq("purchase_request_id", purchaseRequestId)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) return unavailable();

  const items: ComparatorQuote[] = [];
  type Transport = "mock" | "web" | "phone";
  for (const raw of data ?? []) {
    // PostgREST devuelve la llamada como objeto (o lista, según cómo infiera la relación).
    const { call, ...row } = raw as unknown as Record<string, unknown> & { call: { transport: Transport } | { transport: Transport }[] | null };
    const transport = Array.isArray(call) ? (call[0]?.transport ?? null) : (call?.transport ?? null);
    const quote = rowToQuoteDTO(row);
    if (!quote.ok) return quote;
    const item = toComparatorQuote(quote.data, transport);
    if (item) items.push(item);
  }
  return { ok: true, data: { items } };
}

// Llamadas del cotizador iniciadas desde la app (QUO-03), con la clave secreta.
export function createSupabaseDialStore(db: SupabaseClient): DialStore {
  return {
    async reserveCall(input) {
      const insert = await db.from("calls").upsert(
        {
          company_id: input.company_id,
          contact_id: input.supplier_contact_id,
          action_id: input.action_id,
          provider: "vapi",
          transport: "phone",
          status: "queued",
          objective: "Cotización de proveedor",
        },
        { onConflict: "company_id,action_id", ignoreDuplicates: true },
      ).select("id");
      if (insert.error) return writeError(insert.error);
      const created = (insert.data?.length ?? 0) > 0;
      const call = await db
        .from("calls")
        .select("id, contact_id, provider_call_id")
        .eq("company_id", input.company_id)
        .eq("action_id", input.action_id)
        .maybeSingle();
      if (call.error || !call.data) return unavailable();
      if (call.data.contact_id !== input.supplier_contact_id) {
        return { ok: false, error: { code: "CONFLICT", message: "Ese pedido de llamada era para otro proveedor", retryable: false } };
      }
      return { ok: true, data: { call_id: call.data.id, provider_call_id: call.data.provider_call_id, created } };
    },
    async markDialed(input) {
      const { error } = await db
        .from("calls")
        .update({ provider_call_id: input.provider_call_id, status: "ringing", updated_at: new Date().toISOString() })
        .eq("id", input.call_id);
      return error ? unavailable() : { ok: true, data: null };
    },
    async markNotDialed(input) {
      const { error } = await db
        .from("calls")
        .update({ status: input.status, ended_reason: input.reason.slice(0, 300), updated_at: new Date().toISOString() })
        .eq("id", input.call_id);
      return error ? unavailable() : { ok: true, data: null };
    },
  };
}
