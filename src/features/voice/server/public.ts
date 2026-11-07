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
import { getServerEnv } from "@/lib/env";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createMockCallReader, createSupabaseCallReader, type CallReader } from "./call-reads";
import * as calls from "./calls";

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
