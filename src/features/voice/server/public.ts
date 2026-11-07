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
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordCallResult } from "@/features/crm/server/public";
import { getServerEnv } from "@/lib/env";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createVoiceAdminClient } from "./admin-client";
import { createMockCallReader, createSupabaseCallReader, type CallReader } from "./call-reads";
import * as calls from "./calls";
import { processPendingReports, type ProcessSummary } from "./process-reports";
import { createReportStore } from "./report-store";

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

// Cliente privilegiado para procesos sin sesión de usuario (webhook y cron).
export function voiceAdminClient(): SupabaseClient | null {
  try {
    const secretKey = getServerEnv().SUPABASE_SECRET_KEY;
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    return url && secretKey ? createVoiceAdminClient(url, secretKey) : null;
  } catch {
    return null;
  }
}

// Procesa los reportes de fin de llamada pendientes de todas las empresas:
// análisis → resultado en calls → recordCallResult del CRM. Uso interno de
// servidor: lo llama el webhook al recibir un reporte y el cron para reintentar.
export async function processVoiceEvents(input: { limit: number }): Promise<Result<ProcessSummary>> {
  if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 5) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "limit debe estar entre 1 y 5", retryable: false } };
  }
  const db = voiceAdminClient();
  if (!db) {
    return {
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", message: "Falta SUPABASE_SECRET_KEY o la URL de Supabase", retryable: false },
    };
  }
  try {
    const summary = await processPendingReports(
      { store: createReportStore(db), recordCallResult, now: () => new Date() },
      input.limit,
    );
    return { ok: true, data: summary };
  } catch {
    return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudieron procesar los avisos", retryable: true } };
  }
}
