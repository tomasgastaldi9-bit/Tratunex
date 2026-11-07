import "server-only";

import type { GetAgentProfile, SaveAgentKnowledge, SaveCompanyProfile } from "@/contracts/agent";
import type {
  CheckPurchasePolicy,
  CreatePurchaseRequest,
  GetPurchasePolicy,
  GetPurchaseRequest,
  SavePurchasePolicy,
} from "@/contracts/purchases";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createProfileService } from "./profile-service";
import { createSectionService } from "./section-service";

/**
 * Puerta de entrada del módulo Agente para las páginas y los otros módulos.
 * Nadie importa los archivos internos de server/: solo este.
 *
 * La lógica está en profile-service.ts y section-service.ts (sin "server-only", para poder probarla).
 * Acá solo le damos el cliente real de Supabase.
 */

// Las páginas del servidor no pueden escribir cookies, por eso al leer
// usamos cookies de solo lectura (el proxy se encarga de refrescarlas).
const readService = createProfileService(() => createRequestSupabaseClient({ readOnlyCookies: true }));
// Al guardar (acción del servidor) sí se pueden escribir cookies.
const writeService = createProfileService(() => createRequestSupabaseClient());
// El conocimiento (y las demás secciones) se guarda con save_agent_section.
const sectionWriteService = createSectionService(() => createRequestSupabaseClient());

/** Devuelve la versión vigente del agente de la empresa y si la persona puede editarla. */
export const getAgentProfile: GetAgentProfile = (ctx) => readService.getAgentProfile(ctx);

/** Guarda el perfil de empresa como una versión nueva (solo admin, sin duplicados). */
export const saveCompanyProfile: SaveCompanyProfile = (ctx, input) => writeService.saveCompanyProfile(ctx, input);

/** Guarda la lista completa de conocimiento como una versión nueva (solo admin, sin duplicados). */
export const saveAgentKnowledge: SaveAgentKnowledge = (ctx, input) => sectionWriteService.saveAgentKnowledge(ctx, input);

// ---------------------------------------------------------------------------
// Compras (brief v3: BUY-01 y BUY-02)
// ESQUELETO: responden un error explícito hasta que la tarea "Servidor" de
// compras las implemente, sin cambiar estas firmas (src/contracts/purchases.ts).
// ---------------------------------------------------------------------------

const NO_IMPLEMENTADO = {
  ok: false,
  error: { code: "PROVIDER_ERROR", message: "Esta función todavía no está implementada", retryable: false },
} as const;

/** Crea la compra que necesita la pyme (BUY-01). */
export const createPurchaseRequest: CreatePurchaseRequest = async () => NO_IMPLEMENTADO;

/** Lee una compra de la empresa (la usan prospección, cotizaciones y el comparador). */
export const getPurchaseRequest: GetPurchaseRequest = async () => NO_IMPLEMENTADO;

/** Lee las reglas de pago de la empresa y si la persona puede cambiarlas (BUY-02). */
export const getPurchasePolicy: GetPurchasePolicy = async () => NO_IMPLEMENTADO;

/** Guarda las reglas de pago de la empresa (solo admin, sin duplicados). */
export const savePurchasePolicy: SavePurchasePolicy = async () => NO_IMPLEMENTADO;

/** Decide si un pago se hace solo, necesita aprobación o se rechaza. La llama payInvoice (Tomás). */
export const checkPurchasePolicy: CheckPurchasePolicy = async () => NO_IMPLEMENTADO;
