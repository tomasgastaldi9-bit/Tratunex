// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { ActionCtx, Result } from "../../../contracts/common";
import type { CallResultV1, CallStatus } from "../../../contracts/voice";
import { normalizeEndOfCallReport, type KnownCall } from "./call-analysis";

// VOZ-07 (TRA-48): procesa cada end-of-call-report guardado por el webhook.
// Pasos por aviso: análisis → guardar el resultado en calls → entregar al CRM
// con un action_id estable → marcar procesado. Si algo falla, el aviso queda
// pendiente y se reintenta (hasta MAX_ATTEMPTS); nunca se procesa dos veces a la vez.

export const MAX_ATTEMPTS = 5;
export const LOCK_SECONDS = 60;

export type PendingReport = {
  id: number;
  provider_event_id: string;
  payload: unknown;
  attempts: number;
  // null si todavía no se pudo asociar a una llamada interna (queda para conciliar).
  call: KnownCall | null;
};

export type CallOutcome = {
  status: CallStatus;
  ended_at: string;
  ended_reason: string | null;
  recording_url: string | null;
  transcript: string | null;
  result: CallResultV1;
};

export type ReportStore = {
  // Reserva hasta `limit` avisos pendientes (bloqueo de LOCK_SECONDS) y resuelve su llamada.
  claimPendingReports: (limit: number, now: Date) => Promise<PendingReport[]>;
  saveCallOutcome: (callId: string, outcome: CallOutcome, now: Date) => Promise<void>;
  markProcessed: (report: PendingReport, now: Date) => Promise<void>;
  // Libera la reserva, suma un intento y guarda el motivo.
  markFailed: (report: PendingReport, error: string, now: Date) => Promise<void>;
  // Libera la reserva sin sumar intento (aviso aún sin llamada asociada).
  release: (report: PendingReport) => Promise<void>;
};

export type RecordCallResult = (ctx: ActionCtx, input: CallResultV1) => Promise<Result<unknown>>;

export type ProcessDeps = {
  store: ReportStore;
  recordCallResult: RecordCallResult;
  now: () => Date;
};

export type ProcessSummary = { processed: number; pending: number; failed: number };

// action_id estable: reintentar el mismo aviso nunca registra dos resultados en el CRM.
export function recordCallResultActionId(providerEventId: string): string {
  return `voice:record-call-result:${providerEventId}`;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function httpUrl(value: unknown): string | null {
  return typeof value === "string" && /^https?:\/\//i.test(value) ? value : null;
}

// Grabación, transcripción y motivo de fin, en los lugares que documenta Vapi.
export function extractCallArtifacts(payload: unknown) {
  const message = record(record(payload).message);
  const call = record(message.call);
  const artifact = { ...record(call.artifact), ...record(message.artifact) };
  const recording = record(artifact.recording);
  const transcript = [artifact.transcript, message.transcript].find((value) => typeof value === "string" && value.trim());
  const endedReason = [message.endedReason, call.endedReason].find((value) => typeof value === "string" && value);
  return {
    recording_url: httpUrl(artifact.recordingUrl) ?? httpUrl(recording.url) ?? httpUrl(message.recordingUrl),
    transcript: typeof transcript === "string" ? transcript : null,
    ended_reason: typeof endedReason === "string" ? endedReason : null,
  };
}

export async function processPendingReports(deps: ProcessDeps, limit: number): Promise<ProcessSummary> {
  const summary: ProcessSummary = { processed: 0, pending: 0, failed: 0 };
  const reports = await deps.store.claimPendingReports(limit, deps.now());

  for (const report of reports) {
    const now = deps.now();
    if (!report.call) {
      await deps.store.release(report);
      summary.pending += 1;
      continue;
    }

    try {
      const normalized = normalizeEndOfCallReport(report.payload, report.call, {
        eventId: report.provider_event_id,
        now: deps.now,
      });
      if (!normalized.ok) {
        await deps.store.markFailed(report, normalized.error.message, now);
        summary.failed += 1;
        continue;
      }

      const result = normalized.data;
      const artifacts = extractCallArtifacts(report.payload);
      await deps.store.saveCallOutcome(
        report.call.id,
        {
          status: result.technical_status === "failed" ? "failed" : "completed",
          ended_at: result.occurred_at,
          ended_reason: artifacts.ended_reason,
          recording_url: artifacts.recording_url,
          transcript: artifacts.transcript,
          result,
        },
        now,
      );

      // La identidad sale de la llamada guardada; el actor es Voz actuando por esa llamada.
      const delivered = await deps.recordCallResult(
        {
          company_id: report.call.company_id,
          actor_type: "voice",
          actor_id: report.call.id,
          action_id: recordCallResultActionId(report.provider_event_id),
        },
        result,
      );
      if (!delivered.ok) {
        await deps.store.markFailed(report, `CRM ${delivered.error.code}: ${delivered.error.message}`, now);
        summary.failed += 1;
        continue;
      }

      await deps.store.markProcessed(report, now);
      summary.processed += 1;
    } catch (error) {
      // Si tampoco se puede anotar el fallo, la reserva vence sola y otro proceso lo retoma.
      await deps.store
        .markFailed(report, error instanceof Error ? error.message : "Error inesperado", now)
        .catch(() => undefined);
      summary.failed += 1;
    }
  }

  return summary;
}
