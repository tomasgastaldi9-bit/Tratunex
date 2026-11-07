import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { Result } from "../../../contracts/common";
import { NormalizedCallResultV1Schema, type CallResultV1, type NextAction } from "../../../contracts/voice";

// Análisis de fin de llamada (TRA-47): convierte el end-of-call-report de Vapi
// en un CallResultV1 normalizado. El modelo de Vapi solo extrae lo que se dijo;
// las reglas (buzón, fechas, próxima acción) se aplican acá, en código.

// ---------------------------------------------------------------------------
// 1. Lo que se le pide a Vapi que extraiga (structured output o analysisPlan).
// ---------------------------------------------------------------------------
export const CALL_ANALYSIS_OUTPUT_NAME = "tratunex_call_result";

export const CALLBACK_DAYS = [
  "no_especificado",
  "hoy",
  "manana",
  "pasado_manana",
  "lunes",
  "martes",
  "miercoles",
  "jueves",
  "viernes",
  "sabado",
  "domingo",
  "fecha_exacta",
] as const;

// JSON Schema para configurar en Vapi. Sin tipos unión ni null: los campos que
// pueden faltar son opcionales.
export const callAnalysisJsonSchema = {
  type: "object",
  properties: {
    spoke_with_person: {
      type: "boolean",
      description: "true solo si conversó una persona real. false si atendió un contestador, una máquina o nadie.",
    },
    is_potential_client: {
      type: "string",
      enum: ["yes", "no", "unknown"],
      description: "Si cumple los criterios de cliente potencial de la empresa.",
    },
    outcome: {
      type: "string",
      enum: ["interested", "not_interested", "callback_requested", "wants_to_buy", "not_assessed"],
    },
    do_not_contact_requested: {
      type: "boolean",
      description: "true solo si pidió explícitamente que no lo vuelvan a llamar.",
    },
    score: { type: "integer", minimum: 0, maximum: 100, description: "Qué tan buen prospecto es, de 0 a 100." },
    callback_day: {
      type: "string",
      enum: [...CALLBACK_DAYS],
      description: "Día que pidió para volver a llamar, tal como lo dijo. fecha_exacta si dijo una fecha con número.",
    },
    callback_date: { type: "string", description: "Solo si callback_day es fecha_exacta: AAAA-MM-DD." },
    callback_time: { type: "string", description: "Hora que pidió, 24 h, HH:mm. Omitir si no dijo hora." },
    summary: { type: "string", description: "Resumen en español de 3 a 5 líneas: quién atendió, qué dijo y qué sigue." },
  },
  required: ["spoke_with_person", "is_potential_client", "outcome", "do_not_contact_requested", "summary"],
} as const;

export const callAnalysisPrompt = [
  "Analizá la transcripción de una llamada de prospección en frío y completá el esquema.",
  "Reglas:",
  "- Si atendió un contestador, una máquina o nadie: spoke_with_person=false y outcome=not_assessed.",
  "- outcome=callback_requested solo si la persona pidió que la llamen en otro momento.",
  "- callback_day y callback_time: copiá lo que dijo (\"el jueves a las 2 de la tarde\" = jueves, 14:00). No calcules fechas.",
  "- do_not_contact_requested=true solo si pidió explícitamente no ser llamada otra vez.",
  "- No inventes datos que no estén en la transcripción.",
].join("\n");

const CallAnalysisResultSchema = z.object({
  spoke_with_person: z.boolean(),
  is_potential_client: z.enum(["yes", "no", "unknown"]),
  outcome: z.enum(["interested", "not_interested", "callback_requested", "wants_to_buy", "not_assessed"]),
  do_not_contact_requested: z.boolean(),
  score: z.number().int().min(0).max(100).optional(),
  callback_day: z.enum(CALLBACK_DAYS).optional(),
  callback_date: z.string().optional(),
  callback_time: z.string().optional(),
  summary: z.string().trim().min(1),
});
export type CallAnalysisResult = z.infer<typeof CallAnalysisResultSchema>;

// ---------------------------------------------------------------------------
// 2. Fecha del callback, en hora de Argentina (UTC-3 fijo, sin horario de verano).
// ---------------------------------------------------------------------------
const ARGENTINA_OFFSET_HOURS = -3;
export const DEFAULT_CALLBACK_HOUR = "10:00";

const WEEKDAYS: Record<string, number> = {
  domingo: 0, lunes: 1, martes: 2, miercoles: 3, jueves: 4, viernes: 5, sabado: 6,
};

type CallbackResolution = { due_at: string; reason: string } | { due_at: null; reason: string };

function localDateParts(instant: Date) {
  const local = new Date(instant.getTime() + ARGENTINA_OFFSET_HOURS * 3_600_000);
  return { year: local.getUTCFullYear(), month: local.getUTCMonth(), day: local.getUTCDate(), weekday: local.getUTCDay() };
}

function toUtcFromLocal(year: number, month: number, day: number, hour: number, minute: number): Date {
  return new Date(Date.UTC(year, month, day, hour - ARGENTINA_OFFSET_HOURS, minute));
}

export function resolveCallbackDueAt(analysis: CallAnalysisResult, callEndedAt: Date): CallbackResolution {
  const day = analysis.callback_day ?? "no_especificado";
  if (day === "no_especificado") {
    return { due_at: null, reason: "Pidió que lo llamen sin decir cuándo" };
  }

  const timeText = analysis.callback_time ?? DEFAULT_CALLBACK_HOUR;
  const time = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(timeText);
  if (!time) {
    return { due_at: null, reason: `Pidió que lo llamen con una hora poco clara (${timeText})` };
  }
  const [hour, minute] = [Number(time[1]), Number(time[2])];

  const today = localDateParts(callEndedAt);
  let target: { year: number; month: number; day: number };
  if (day === "fecha_exacta") {
    const date = /^(\d{4})-(\d{2})-(\d{2})$/.exec(analysis.callback_date ?? "");
    if (!date) {
      return { due_at: null, reason: "Pidió una fecha que no se pudo interpretar" };
    }
    target = { year: Number(date[1]), month: Number(date[2]) - 1, day: Number(date[3]) };
  } else {
    let offsetDays: number;
    if (day === "hoy") offsetDays = 0;
    else if (day === "manana") offsetDays = 1;
    else if (day === "pasado_manana") offsetDays = 2;
    else {
      // Próxima ocurrencia de ese día; si es hoy, la semana que viene.
      const diff = (WEEKDAYS[day] - today.weekday + 7) % 7;
      offsetDays = diff === 0 ? 7 : diff;
    }
    target = { year: today.year, month: today.month, day: today.day + offsetDays };
  }

  const dueAt = toUtcFromLocal(target.year, target.month, target.day, hour, minute);
  const check = localDateParts(dueAt);
  if (day === "fecha_exacta" && (check.month !== target.month || check.day !== target.day)) {
    return { due_at: null, reason: "Pidió una fecha que no existe" };
  }
  if (dueAt.getTime() <= callEndedAt.getTime()) {
    return { due_at: null, reason: "La fecha pedida ya pasó" };
  }

  const hourNote = analysis.callback_time ? "" : ` (sin hora: se agenda a las ${DEFAULT_CALLBACK_HOUR})`;
  return { due_at: dueAt.toISOString(), reason: `Pidió que lo llamen: ${day.replace("_", " ")} ${timeText}${hourNote}` };
}

// ---------------------------------------------------------------------------
// 3. Motivo de fin de llamada de Vapi → estado técnico y quién atendió.
// ---------------------------------------------------------------------------
export type EndedReasonClass = "conversation" | "voicemail" | "no_answer" | "failed";

const NO_ANSWER_REASONS = new Set(["customer-did-not-answer", "customer-busy", "twilio-reported-customer-misdialed"]);
const FAILED_PREFIXES = [
  "pipeline-error-",
  "call.start.error",
  "call-start-error",
  "call.in-progress.error-",
  "sip-outbound-",
  "assistant-request-",
];
const FAILED_REASONS = new Set([
  "twilio-failed-to-connect-call",
  "assistant-not-found",
  "assistant-error",
  "phone-call-provider-closed-websocket",
  "worker-shutdown",
  "manually-canceled",
  "call-deleted",
  "unknown-error",
]);

export function classifyEndedReason(endedReason: string | undefined): EndedReasonClass {
  if (!endedReason) return "conversation";
  if (endedReason === "voicemail") return "voicemail";
  if (NO_ANSWER_REASONS.has(endedReason)) return "no_answer";
  if (FAILED_REASONS.has(endedReason) || FAILED_PREFIXES.some((prefix) => endedReason.startsWith(prefix))) return "failed";
  return "conversation";
}

// ---------------------------------------------------------------------------
// 4. end-of-call-report → CallResultV1 normalizado.
// ---------------------------------------------------------------------------
const StructuredOutputsSchema = z.record(z.string(), z.object({ name: z.string().optional(), result: z.unknown() }));

const EndOfCallReportSchema = z.object({
  message: z.object({
    type: z.literal("end-of-call-report"),
    endedReason: z.string().optional(),
    endedAt: z.string().optional(),
    analysis: z.object({ summary: z.string().optional(), structuredData: z.unknown().optional() }).optional(),
    artifact: z.object({ structuredOutputs: StructuredOutputsSchema.optional() }).optional(),
    call: z.object({
      id: z.string().min(1),
      endedReason: z.string().optional(),
      endedAt: z.string().optional(),
      analysis: z.object({ summary: z.string().optional(), structuredData: z.unknown().optional() }).optional(),
      artifact: z.object({ structuredOutputs: StructuredOutputsSchema.optional() }).optional(),
    }),
  }),
});

// Lo que Voz ya sabe de la llamada por su propia tabla, no por el aviso.
export type KnownCall = {
  id: string;
  company_id: string;
  contact_id: string;
  deal_id: string | null;
  agent_version: number;
  provider_call_id: string;
};

export type NormalizeOptions = {
  eventId: string;
  now: () => Date;
  // true si una herramienta ya agendó el callback durante la llamada (BRIEF §6): no se repite.
  callbackAlreadyScheduled?: boolean;
};

function pickAnalysis(report: z.infer<typeof EndOfCallReportSchema>): unknown {
  const outputs = { ...report.message.call.artifact?.structuredOutputs, ...report.message.artifact?.structuredOutputs };
  const named = Object.values(outputs).find((output) => output.name === CALL_ANALYSIS_OUTPUT_NAME);
  if (named && named.result !== null && named.result !== undefined) return named.result;
  return report.message.analysis?.structuredData ?? report.message.call.analysis?.structuredData;
}

function validationError(message: string): Extract<Result<never>, { ok: false }> {
  return { ok: false, error: { code: "VALIDATION_ERROR", message, retryable: false } };
}

export function normalizeEndOfCallReport(payload: unknown, call: KnownCall, options: NormalizeOptions): Result<CallResultV1> {
  const parsed = EndOfCallReportSchema.safeParse(payload);
  if (!parsed.success) {
    return validationError("El aviso no es un end-of-call-report válido");
  }
  const message = parsed.data.message;
  // La identidad sale de la llamada guardada; el aviso solo tiene que coincidir.
  if (message.call.id !== call.provider_call_id) {
    return validationError("El aviso no corresponde a esta llamada");
  }

  const endedReason = message.endedReason ?? message.call.endedReason;
  const endedAtText = message.call.endedAt ?? message.endedAt;
  const endedAt = endedAtText && !Number.isNaN(Date.parse(endedAtText)) ? new Date(endedAtText) : options.now();
  const reasonClass = classifyEndedReason(endedReason);
  const analysis = CallAnalysisResultSchema.safeParse(pickAnalysis(parsed.data));
  const fallbackSummary = message.analysis?.summary ?? message.call.analysis?.summary;

  const base = {
    schema_version: "1" as const,
    event_id: options.eventId,
    occurred_at: endedAt.toISOString(),
    company_id: call.company_id,
    call_id: call.id,
    contact_id: call.contact_id,
    deal_id: call.deal_id,
    agent_version: call.agent_version,
    transcript_url: null,
  };
  const notAssessed = {
    is_potential_client: "unknown" as const,
    outcome: "not_assessed" as const,
    do_not_contact_requested: false,
    score: null,
  };

  let result: CallResultV1;
  if (reasonClass !== "conversation" || (analysis.success && !analysis.data.spoke_with_person)) {
    const summaries: Record<EndedReasonClass, string> = {
      voicemail: "Atendió el contestador.",
      no_answer: "No atendió nadie.",
      failed: "La llamada no se pudo completar por un error técnico.",
      conversation: "No habló una persona.",
    };
    result = {
      ...base,
      ...notAssessed,
      technical_status: reasonClass === "failed" ? "failed" : "completed",
      answered_by: reasonClass === "voicemail" ? "voicemail" : "unknown",
      summary: `${summaries[reasonClass]}${endedReason ? ` (${endedReason})` : ""}`,
      next_action: null,
    };
  } else if (!analysis.success) {
    // Hubo llamada pero no hay análisis usable: una persona revisa, sin inventar resultado.
    result = {
      ...base,
      ...notAssessed,
      technical_status: "completed",
      answered_by: "unknown",
      summary: fallbackSummary?.trim() || "Llamada terminada sin análisis automático.",
      next_action: { type: "human_review", due_at: null, reason: "Sin análisis automático: revisar la transcripción" },
    };
  } else {
    const data = analysis.data;
    let nextAction: NextAction | null = null;
    if (data.do_not_contact_requested) {
      nextAction = null;
    } else if (data.outcome === "callback_requested" && !options.callbackAlreadyScheduled) {
      const callback = resolveCallbackDueAt(data, endedAt);
      nextAction = callback.due_at
        ? { type: "callback", due_at: callback.due_at, reason: callback.reason }
        : { type: "human_review", due_at: null, reason: callback.reason };
    } else if (data.outcome === "wants_to_buy") {
      nextAction = { type: "human_review", due_at: null, reason: "Quiere comprar: cerrar la venta con una persona" };
    }

    result = {
      ...base,
      technical_status: "completed",
      answered_by: "human",
      is_potential_client: data.is_potential_client,
      outcome: data.outcome,
      do_not_contact_requested: data.do_not_contact_requested,
      score: data.score ?? null,
      summary: data.summary,
      next_action: nextAction,
    };
  }

  const checked = NormalizedCallResultV1Schema.safeParse(result);
  return checked.success ? { ok: true, data: checked.data } : validationError("El resultado normalizado no cumple CallResultV1");
}
