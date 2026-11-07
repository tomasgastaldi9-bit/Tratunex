import "server-only";

import type { ActionCtx, Ctx, Result } from "@/contracts/common";
import type {
  BeloPair,
  BeloPrice,
  DispatchDueCallsData,
  DispatchDueCallsInput,
  GetCallData,
  GetCallInput,
  ListCallsData,
  ListCallsInput,
  StartCallData,
  StartCallInput,
} from "@/contracts/voice";
import { createClient } from "@supabase/supabase-js";
import { getServerEnv } from "@/lib/env";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createMockCallReader, createSupabaseCallReader, type CallReader } from "./call-reads";
import * as calls from "./calls";
import { importQuoteFromCall as importQuote, type ComparatorQuote, type ImportQuoteFromCallData } from "./quote-import";
import { createSupabaseDialStore, createSupabaseQuoteStore, listComparatorQuotes } from "./quote-store";
import { createVapiCall, fetchVapiAssistantModel, fetchVapiCall } from "./vapi-api";
import { buildVapiQuoteCallBody, formatNeededBy, requestQuoteCall as dialQuote, type RequestQuoteCallData } from "./quote-dial";
import { getPurchaseRequest } from "@/features/agent/server/public";
import { getSupplier } from "@/features/crm/server/public";
import { fetchBeloPrice } from "./belo-price";

// Funciones públicas de Voz para otros módulos de servidor (BRIEF §10).
// VOICE_MODE=mock (por defecto) responde sin llamar a nadie y muestra llamadas
// de ejemplo; live lee la tabla calls (iniciar llamadas reales llega con VOZ-04).

function voiceDeps(): calls.VoiceDeps | null {
  try {
    return { mode: getServerEnv().VOICE_MODE, now: () => new Date() };
  } catch {
    return null;
  }
}

const invalidConfig = {
  ok: false,
  error: { code: "PROVIDER_UNAVAILABLE", message: "Configuración de voz inválida: revisá VOICE_MODE", retryable: false },
} as const;

// Modo actual, para mostrarlo en pantalla. null si VOICE_MODE es inválido.
export function voiceMode(): calls.VoiceMode | null {
  return voiceDeps()?.mode ?? null;
}

async function callReader(): Promise<CallReader | null> {
  const deps = voiceDeps();
  if (!deps) return null;
  if (deps.mode === "mock") return createMockCallReader();
  return createSupabaseCallReader(await createRequestSupabaseClient({ readOnlyCookies: true }));
}

export async function startCall(actionCtx: ActionCtx, input: StartCallInput): Promise<Result<StartCallData>> {
  const deps = voiceDeps();
  return deps ? calls.startCall(actionCtx, input, deps) : invalidConfig;
}

// Lo invoca POST /api/jobs/tick (Tomás) cada minuto.
export async function dispatchDueCalls(ctx: Ctx, input: DispatchDueCallsInput): Promise<Result<DispatchDueCallsData>> {
  const deps = voiceDeps();
  return deps ? calls.dispatchDueCalls(ctx, input, deps) : invalidConfig;
}

// Lista de llamadas de la empresa activa, de la más nueva a la más vieja.
// El CRM la usa con contact_id para el historial de un contacto.
export async function listCalls(ctx: Ctx, input: ListCallsInput): Promise<Result<ListCallsData>> {
  const reader = await callReader();
  return reader ? reader.list(ctx, input) : invalidConfig;
}

export async function getCall(ctx: Ctx, input: GetCallInput): Promise<Result<GetCallData>> {
  const reader = await callReader();
  return reader ? reader.get(ctx, input) : invalidConfig;
}

// ---------------------------------------------------------------------------
// Cotizaciones de proveedores (QUO-02).
// ---------------------------------------------------------------------------
const quotesUnavailable = {
  ok: false,
  error: {
    code: "PROVIDER_UNAVAILABLE",
    message: "Faltan VAPI_PRIVATE_KEY, SUPABASE_SECRET_KEY o NEXT_PUBLIC_SUPABASE_URL en el servidor",
    retryable: false,
  },
} as const;

// Trae de Vapi la cotización de una llamada del cotizador y la guarda para la
// compra y el proveedor indicados. Reintentar con la misma llamada no duplica.
export async function importQuoteFromCall(actionCtx: ActionCtx, input: unknown): Promise<Result<ImportQuoteFromCallData>> {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return quotesUnavailable;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const vapiKey = env.VAPI_PRIVATE_KEY;
  const secretKey = env.SUPABASE_SECRET_KEY;
  if (!supabaseUrl || !vapiKey || !secretKey) return quotesUnavailable;

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return importQuote(actionCtx, input, {
    fetchCall: (providerCallId) => fetchVapiCall(providerCallId, { apiKey: vapiKey }),
    store: createSupabaseQuoteStore(admin),
  });
}

// Cotizaciones de una compra, en la forma que lee el comparador (ORD-02).
export async function listSupplierQuotes(ctx: Ctx, input: { purchase_request_id: string }): Promise<Result<{ items: ComparatorQuote[] }>> {
  if (!/^[0-9a-f-]{36}$/i.test(input.purchase_request_id)) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "La compra no es válida", retryable: false } };
  }
  return listComparatorQuotes(await createRequestSupabaseClient({ readOnlyCookies: true }), ctx, input.purchase_request_id);
}

// ---------------------------------------------------------------------------
// Precio de Belo (QUO-04). La API es pública; se guarda 1 minuto por par para
// no consultarla en cada pantalla. Si Belo no responde se informa el error:
// nunca se muestra un precio inventado.
// ---------------------------------------------------------------------------
const BELO_CACHE_MS = 60_000;
const beloCache = new Map<BeloPair, { at: number; price: BeloPrice }>();

export async function getBeloPrice(pair: BeloPair = "USDT/ARS"): Promise<Result<BeloPrice>> {
  const cached = beloCache.get(pair);
  if (cached && Date.now() - cached.at < BELO_CACHE_MS) return { ok: true, data: cached.price };
  const result = await fetchBeloPrice(pair);
  if (result.ok) beloCache.set(pair, { at: Date.now(), price: result.data });
  return result;
}

// ---------------------------------------------------------------------------
// Pedir cotización por llamada desde la app (QUO-03).
// ---------------------------------------------------------------------------
const dialUnavailable = {
  ok: false,
  error: {
    code: "PROVIDER_UNAVAILABLE",
    message: "Faltan VAPI_PRIVATE_KEY, VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID o SUPABASE_SECRET_KEY en el servidor",
    retryable: false,
  },
} as const;

// El modelo del asistente casi no cambia: se guarda 5 minutos para que "Llamar
// ahora" no espere una consulta extra a Vapi antes de cada llamada.
const ASSISTANT_CACHE_MS = 5 * 60_000;
const assistantCache = new Map<string, { at: number; model: Record<string, unknown> }>();

async function cachedAssistantModel(assistantId: string, apiKey: string): Promise<Result<Record<string, unknown>>> {
  const cached = assistantCache.get(assistantId);
  if (cached && Date.now() - cached.at < ASSISTANT_CACHE_MS) return { ok: true, data: cached.model };
  const model = await fetchVapiAssistantModel(assistantId, { apiKey });
  if (model.ok) assistantCache.set(assistantId, { at: Date.now(), model: model.data });
  return model;
}

// Llama al proveedor con el asistente cotizador y los datos de la compra. Un
// mismo action_id (un clic) nunca genera dos llamadas.
export async function requestQuoteCall(actionCtx: ActionCtx, input: unknown): Promise<Result<RequestQuoteCallData>> {
  let env: ReturnType<typeof getServerEnv>;
  try {
    env = getServerEnv();
  } catch {
    return dialUnavailable;
  }
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const { VAPI_PRIVATE_KEY: apiKey, VAPI_ASSISTANT_ID: assistantId, VAPI_PHONE_NUMBER_ID: phoneNumberId, SUPABASE_SECRET_KEY: secretKey } = env;
  if (!supabaseUrl || !apiKey || !assistantId || !phoneNumberId || !secretKey) return dialUnavailable;

  const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return dialQuote(actionCtx, input, {
    store: createSupabaseDialStore(admin),
    async loadTarget(ctx, { supplier_contact_id, purchase_request_id }) {
      const [supplier, purchase, company] = await Promise.all([
        getSupplier(ctx, { contact_id: supplier_contact_id }),
        getPurchaseRequest(ctx, { purchase_request_id }),
        (await createRequestSupabaseClient()).from("companies").select("name").eq("id", ctx.company_id).maybeSingle(),
      ]);
      if (!supplier.ok) return supplier;
      if (!purchase.ok) return purchase;
      if (supplier.data.supplier.do_not_contact) {
        return { ok: false, error: { code: "FORBIDDEN", message: "El proveedor pidió que no lo llamen", retryable: false } };
      }
      const request = purchase.data.purchase_request;
      return {
        ok: true,
        data: {
          supplier_phone_e164: supplier.data.supplier.phone_e164,
          brief: {
            buyer_name: company.data?.name ?? "nuestra empresa",
            product: request.product,
            quantity: request.quantity,
            unit: request.unit || "unidades",
            needed_by: formatNeededBy(request.needed_by),
            delivery_zone: request.zone || "la dirección que te vamos a confirmar",
          },
        },
      };
    },
    async dial(request) {
      const model = await cachedAssistantModel(assistantId, apiKey);
      if (!model.ok) return model;
      return createVapiCall(buildVapiQuoteCallBody(request, { assistantId, phoneNumberId, assistantModel: model.data }), { apiKey });
    },
  });
}
