import "server-only";

import type { GetAgentProfile, SaveAgentKnowledge, SaveCompanyProfile } from "@/contracts/agent";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createProfileService } from "./profile-service";

/**
 * Puerta de entrada del módulo Agente para las páginas y los otros módulos.
 * Nadie importa los archivos internos de server/: solo este.
 *
 * La lógica está en profile-service.ts (sin "server-only", para poder probarla).
 * Acá solo le damos el cliente real de Supabase.
 */

// Las páginas del servidor no pueden escribir cookies, por eso al leer
// usamos cookies de solo lectura (el proxy se encarga de refrescarlas).
const readService = createProfileService(() => createRequestSupabaseClient({ readOnlyCookies: true }));
// Al guardar (acción del servidor) sí se pueden escribir cookies.
const writeService = createProfileService(() => createRequestSupabaseClient());

/** Devuelve la versión vigente del agente de la empresa y si la persona puede editarla. */
export const getAgentProfile: GetAgentProfile = (ctx) => readService.getAgentProfile(ctx);

/** Guarda el perfil de empresa como una versión nueva (solo admin, sin duplicados). */
export const saveCompanyProfile: SaveCompanyProfile = (ctx, input) => writeService.saveCompanyProfile(ctx, input);

/**
 * Guarda la lista completa de conocimiento como una versión nueva (AGT-02).
 * ESQUELETO: responde un error explícito hasta que la tarea "Servidor" de
 * AGT-02 lo implemente, sin cambiar esta firma.
 */
export const saveAgentKnowledge: SaveAgentKnowledge = async () => ({
  ok: false,
  error: { code: "PROVIDER_ERROR", message: "Esta función todavía no está implementada", retryable: false },
});
