import "server-only";

import type { GetAgentProfile, SaveAgentKnowledge, SaveCompanyProfile } from "@/contracts/agent";
import type {
  CheckPurchasePolicy,
  CreatePurchaseRequest,
  GetPurchasePolicy,
  GetPurchaseRequest,
  RankQuotes,
  SavePurchasePolicy,
} from "@/contracts/purchases";
// Otros módulos, siempre por su public.ts: Voz (cotizaciones) y CRM (nombre del proveedor).
import { getContact } from "@/features/crm/server/public";
import { listSupplierQuotes } from "@/features/voice/server/public";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { createProfileService } from "./profile-service";
import { createPurchaseService } from "./purchase-service";
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

// Compras: leer (páginas y checkPurchasePolicy) usa cookies de solo lectura; guardar usa las normales.
// El de lectura además recibe las funciones reales de Voz y del CRM: rankQuotes
// las usa para leer las cotizaciones de la compra cuando no se las pasan.
const purchaseReadService = createPurchaseService(() => createRequestSupabaseClient({ readOnlyCookies: true }), {
  listSupplierQuotes,
  getContact,
});
const purchaseWriteService = createPurchaseService(() => createRequestSupabaseClient());

/** Devuelve la versión vigente del agente de la empresa y si la persona puede editarla. */
export const getAgentProfile: GetAgentProfile = (ctx) => readService.getAgentProfile(ctx);

/** Guarda el perfil de empresa como una versión nueva (solo admin, sin duplicados). */
export const saveCompanyProfile: SaveCompanyProfile = (ctx, input) => writeService.saveCompanyProfile(ctx, input);

/** Guarda la lista completa de conocimiento como una versión nueva (solo admin, sin duplicados). */
export const saveAgentKnowledge: SaveAgentKnowledge = (ctx, input) => sectionWriteService.saveAgentKnowledge(ctx, input);

// ---------------------------------------------------------------------------
// Compras (brief v3: BUY-01 y BUY-02)
// La lógica está en purchase-service.ts (firmas en src/contracts/purchases.ts).
// ---------------------------------------------------------------------------

/** Crea la compra que necesita la pyme (BUY-01). */
export const createPurchaseRequest: CreatePurchaseRequest = (ctx, input) =>
  purchaseWriteService.createPurchaseRequest(ctx, input);

/** Lee una compra de la empresa (la usan prospección, cotizaciones y el comparador). */
export const getPurchaseRequest: GetPurchaseRequest = (ctx, input) =>
  purchaseReadService.getPurchaseRequest(ctx, input);

/** Lee las reglas de pago de la empresa y si la persona puede cambiarlas (BUY-02). */
export const getPurchasePolicy: GetPurchasePolicy = (ctx) => purchaseReadService.getPurchasePolicy(ctx);

/** Guarda las reglas de pago de la empresa (solo admin, sin duplicados). */
export const savePurchasePolicy: SavePurchasePolicy = (ctx, input) =>
  purchaseWriteService.savePurchasePolicy(ctx, input);

/** Decide si un pago se hace solo, necesita aprobación o se rechaza. La llama payInvoice (Tomás). */
export const checkPurchasePolicy: CheckPurchasePolicy = (ctx, input) =>
  purchaseReadService.checkPurchasePolicy(ctx, input);

/**
 * Ordena las cotizaciones de una compra, recomienda una y lo explica (BUY-03).
 * Solo lee (la compra y las reglas), por eso usa el cliente de solo lectura.
 * La explicación con IA usa ANTHROPIC_API_KEY del servidor; sin clave, usa reglas.
 */
export const rankQuotes: RankQuotes = (ctx, input) => purchaseReadService.rankQuotes(ctx, input);
