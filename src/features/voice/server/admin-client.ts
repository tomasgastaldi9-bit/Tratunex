import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Cliente con la clave secreta, solo para procesos de Voz sin sesión de usuario
// (webhook de Vapi y cron), BRIEF §5. Si Plataforma publica un cliente
// privilegiado común en src/lib/supabase, este archivo pasa a usarlo.
export function createVoiceAdminClient(supabaseUrl: string, secretKey: string): SupabaseClient {
  return createClient(supabaseUrl, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
