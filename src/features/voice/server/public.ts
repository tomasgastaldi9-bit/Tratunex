import "server-only";

import type { ActionCtx, Ctx, Result } from "@/contracts/common";
import type {
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
import { createSupabaseQuoteStore, listComparatorQuotes } from "./quote-store";
import { fetchVapiCall } from "./vapi-api";

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
