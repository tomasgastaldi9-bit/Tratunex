import { createClient } from "@supabase/supabase-js";
import type { VoiceEventStore } from "./webhook";

// Cliente con la clave secreta: solo para el webhook de Vapi, que no tiene sesión
// de usuario (BRIEF §5). Si Plataforma publica un cliente privilegiado común en
// src/lib/supabase, este archivo pasa a usarlo.
export function createVoiceEventStore(supabaseUrl: string, secretKey: string): VoiceEventStore {
  const db = createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return {
    async insert(event) {
      // Empresa y llamada salen de la llamada guardada, nunca del contenido del aviso.
      let companyId: string | null = null;
      let callId: string | null = null;
      if (event.provider_call_id) {
        const { data, error } = await db
          .from("calls")
          .select("id, company_id")
          .eq("provider", "vapi")
          .eq("provider_call_id", event.provider_call_id)
          .maybeSingle();
        if (error) throw error;
        if (data) {
          companyId = data.company_id;
          callId = data.id;
        }
      }

      // ON CONFLICT DO NOTHING: un reenvío no inserta ni devuelve filas.
      const { data, error } = await db
        .from("voice_events")
        .upsert(
          {
            provider: "vapi",
            provider_event_id: event.provider_event_id,
            provider_call_id: event.provider_call_id,
            event_type: event.event_type,
            company_id: companyId,
            call_id: callId,
            payload: event.payload,
          },
          { onConflict: "provider,provider_event_id", ignoreDuplicates: true },
        )
        .select("id");
      if (error) throw error;

      return { duplicate: (data?.length ?? 0) === 0, resolved: callId !== null };
    },
  };
}
