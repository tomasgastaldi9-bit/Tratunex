import type { SupabaseClient } from "@supabase/supabase-js";
import { actionCtxSchema, ctxSchema } from "../../../contracts/common";
import {
  agentProfileVersionSchema,
  saveCompanyProfileInputSchema,
  saveCompanyProfileOutputSchema,
} from "../../../contracts/agent";
import type { GetAgentProfile, SaveCompanyProfile } from "../../../contracts/agent";
import { fail, logError, translateSaveError } from "./save-errors";

/**
 * Lógica del perfil del agente. NO tiene "server-only" a propósito:
 * así los tests la pueden importar. Recibe una función que entrega el cliente
 * de Supabase, y en los tests le pasamos uno falso.
 */

const LECTURA_NO_DISPONIBLE = "No pudimos leer la configuración del agente. Probá de nuevo en un rato.";

export function createProfileService(getClient: () => Promise<SupabaseClient>) {
  const getAgentProfile: GetAgentProfile = async (ctx) => {
    const parsedCtx = ctxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }

    let row: unknown;
    let canEdit: unknown;
    try {
      const client = await getClient();
      // company_id viene del servidor (ctx), nunca del navegador.
      // Pedimos la versión más alta: es la vigente.
      const read = await client
        .from("agent_profiles")
        .select("version, profile, knowledge, created_at, created_by")
        .eq("company_id", parsedCtx.data.company_id)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (read.error) {
        logError("falló la lectura de agent_profiles", read.error);
        return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
      }

      // Quién puede editar lo decide la base, no la pantalla.
      const edit = await client.rpc("can_edit_agent_profile", { p_company_id: parsedCtx.data.company_id });
      if (edit.error) {
        logError("falló can_edit_agent_profile", edit.error);
        return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
      }

      row = read.data;
      canEdit = edit.data;
    } catch (error) {
      // Por ejemplo: no se pudo crear el cliente (faltan las variables de
      // Supabase) o se cortó la conexión.
      logError("excepción al leer el perfil", error);
      return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
    }

    // Sin filas: la empresa todavía no configuró nada.
    if (row === null || row === undefined) {
      return { ok: true, data: { current: null, can_edit: canEdit === true } };
    }

    // Revisamos la fila: si la base tiene algo raro, no inventamos datos.
    const version = agentProfileVersionSchema.safeParse(row);
    if (!version.success) return fail("PROVIDER_ERROR", "La versión guardada tiene un formato inesperado.", false);

    return { ok: true, data: { current: version.data, can_edit: canEdit === true } };
  };

  const saveCompanyProfile: SaveCompanyProfile = async (ctx, input) => {
    const parsedCtx = actionCtxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    // Usamos el valor parseado: viene normalizado (días ordenados, textos sin espacios sobrantes).
    const parsedInput = saveCompanyProfileInputSchema.safeParse(input);
    if (!parsedInput.success) {
      return fail("VALIDATION_ERROR", parsedInput.error.issues[0]?.message ?? "Datos inválidos", false);
    }

    // Solo una persona puede guardar; la voz o el sistema no.
    if (parsedCtx.data.actor_type !== "user") {
      return fail("FORBIDDEN", "Solo una persona admin puede cambiar el agente.", false);
    }

    let result: { data: unknown; error: { message?: string; code?: string } | null };
    try {
      const client = await getClient();
      result = await client.rpc("save_agent_profile", {
        p_company_id: parsedCtx.data.company_id,
        p_action_id: parsedCtx.data.action_id,
        p_base_version: parsedInput.data.base_version,
        p_profile: parsedInput.data.profile,
      });
    } catch (error) {
      logError("excepción al llamar a save_agent_profile", error);
      return fail("PROVIDER_UNAVAILABLE", "No pudimos guardar. Revisá tu conexión y probá de nuevo.", true);
    }
    if (result.error) return translateSaveError(result.error);

    const output = saveCompanyProfileOutputSchema.safeParse(result.data);
    if (!output.success) return fail("PROVIDER_ERROR", "La base respondió algo inesperado al guardar.", false);
    return { ok: true, data: output.data };
  };

  return { getAgentProfile, saveCompanyProfile };
}
