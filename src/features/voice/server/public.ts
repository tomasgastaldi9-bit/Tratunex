import "server-only";

import type { ActionCtx, Ctx, Result } from "@/contracts/common";
import type {
  DispatchDueCallsData,
  DispatchDueCallsInput,
  StartCallData,
  StartCallInput,
} from "@/contracts/voice";
import { getServerEnv } from "@/lib/env";
import * as calls from "./calls";

// Funciones públicas de Voz para otros módulos de servidor (BRIEF §10).
// VOICE_MODE=mock (por defecto) responde sin llamar a nadie; live todavía no está implementado.

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

export async function startCall(actionCtx: ActionCtx, input: StartCallInput): Promise<Result<StartCallData>> {
  const deps = voiceDeps();
  return deps ? calls.startCall(actionCtx, input, deps) : invalidConfig;
}

// Lo invoca POST /api/jobs/tick (Tomás) cada minuto.
export async function dispatchDueCalls(ctx: Ctx, input: DispatchDueCallsInput): Promise<Result<DispatchDueCallsData>> {
  const deps = voiceDeps();
  return deps ? calls.dispatchDueCalls(ctx, input, deps) : invalidConfig;
}
