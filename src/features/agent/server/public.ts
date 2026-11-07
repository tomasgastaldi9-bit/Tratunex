import "server-only";

import type { GetAgentProfile, SaveCompanyProfile } from "@/contracts/agent";

/**
 * Puerta de entrada del módulo Agente para las páginas y los otros módulos.
 * Nadie importa los archivos internos de server/: solo este.
 *
 * ESQUELETO: por ahora las funciones responden un error explícito de
 * "todavía no implementado". La implementación real llega en la tarea
 * "Servidor" de AGT-01 sin cambiar estas firmas (ver README del módulo).
 */

const NO_IMPLEMENTADO = {
  ok: false,
  error: { code: "PROVIDER_ERROR", message: "Esta función todavía no está implementada", retryable: false },
} as const;

/** Devuelve la versión vigente del agente de la empresa y si la persona puede editarla. */
export const getAgentProfile: GetAgentProfile = async () => NO_IMPLEMENTADO;

/** Guarda el perfil de empresa como una versión nueva (solo admin, sin duplicados). */
export const saveCompanyProfile: SaveCompanyProfile = async () => NO_IMPLEMENTADO;
