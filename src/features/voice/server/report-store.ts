import type { SupabaseClient } from "@supabase/supabase-js";
import type { KnownCall } from "./call-analysis";
import { LOCK_SECONDS, MAX_ATTEMPTS, type PendingReport, type ReportStore } from "./process-reports";

// Acceso a voice_events y calls para procesar avisos (TRA-48), con el cliente
// privilegiado de Voz. La reserva es una actualización condicional: solo un
// proceso a la vez puede trabajar un aviso.

type EventRow = {
  id: number;
  provider_event_id: string;
  provider_call_id: string | null;
  call_id: string | null;
  payload: unknown;
  attempts: number;
};

type CallRow = {
  id: string;
  company_id: string;
  contact_id: string;
  deal_id: string | null;
  agent_version: number | null;
  provider_call_id: string | null;
};

async function loadCall(db: SupabaseClient, event: EventRow): Promise<KnownCall | null> {
  let query = db.from("calls").select("id, company_id, contact_id, deal_id, agent_version, provider_call_id");
  if (event.call_id) query = query.eq("id", event.call_id);
  else if (event.provider_call_id) query = query.eq("provider", "vapi").eq("provider_call_id", event.provider_call_id);
  else return null;

  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  const call = data as CallRow | null;
  if (!call || !call.provider_call_id) return null;

  if (!event.call_id) {
    // Conciliación: el aviso llegó antes de que la llamada tuviera su ID de Vapi.
    const { error: linkError } = await db
      .from("voice_events")
      .update({ company_id: call.company_id, call_id: call.id })
      .eq("id", event.id);
    if (linkError) throw linkError;
  }
  return {
    id: call.id,
    company_id: call.company_id,
    contact_id: call.contact_id,
    deal_id: call.deal_id,
    // Hasta que exista getAgentConfig (VOZ-03) todas las llamadas usan la versión 1.
    agent_version: call.agent_version ?? 1,
    provider_call_id: call.provider_call_id,
  };
}

export function createReportStore(db: SupabaseClient): ReportStore {
  return {
    async claimPendingReports(limit, now) {
      const nowIso = now.toISOString();
      const { data, error } = await db
        .from("voice_events")
        .select("id, provider_event_id, provider_call_id, call_id, payload, attempts")
        .eq("event_type", "end-of-call-report")
        .is("processed_at", null)
        .lt("attempts", MAX_ATTEMPTS)
        .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
        .order("received_at", { ascending: true })
        .limit(limit);
      if (error) throw error;

      const claimed: PendingReport[] = [];
      for (const event of (data ?? []) as EventRow[]) {
        const lockedUntil = new Date(now.getTime() + LOCK_SECONDS * 1000).toISOString();
        const { data: locked, error: lockError } = await db
          .from("voice_events")
          .update({ locked_until: lockedUntil })
          .eq("id", event.id)
          .is("processed_at", null)
          .or(`locked_until.is.null,locked_until.lt.${nowIso}`)
          .select("id");
        if (lockError) throw lockError;
        if (!locked?.length) continue; // Otro proceso lo tomó primero.

        claimed.push({
          id: event.id,
          provider_event_id: event.provider_event_id,
          payload: event.payload,
          attempts: event.attempts,
          call: await loadCall(db, event),
        });
      }
      return claimed;
    },

    async saveCallOutcome(callId, outcome, now) {
      const { error } = await db
        .from("calls")
        .update({ ...outcome, updated_at: now.toISOString() })
        .eq("id", callId);
      if (error) throw error;
    },

    async markProcessed(report, now) {
      const { error } = await db
        .from("voice_events")
        .update({ processed_at: now.toISOString(), locked_until: null, last_error: null })
        .eq("id", report.id);
      if (error) throw error;
    },

    async markFailed(report, message) {
      const { error } = await db
        .from("voice_events")
        .update({ attempts: report.attempts + 1, locked_until: null, last_error: message.slice(0, 500) })
        .eq("id", report.id);
      if (error) throw error;
    },

    async release(report) {
      const { error } = await db.from("voice_events").update({ locked_until: null }).eq("id", report.id);
      if (error) throw error;
    },
  };
}
