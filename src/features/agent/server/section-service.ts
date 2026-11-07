import type { SupabaseClient } from "@supabase/supabase-js";
import { actionCtxSchema } from "../../../contracts/common";
import { saveAgentKnowledgeInputSchema, saveAgentKnowledgeOutputSchema } from "../../../contracts/agent";
import type { SaveAgentKnowledge } from "../../../contracts/agent";
import { fail, logError, translateSaveError } from "./save-errors";

/**
 * Guardado de las demás secciones del agente (por ahora: conocimiento).
 * NO tiene "server-only" a propósito: así los tests la pueden importar.
 * Recibe una función que entrega el cliente de Supabase; en los tests le
 * pasamos uno falso.
 */
export function createSectionService(getClient: () => Promise<SupabaseClient>) {
  const saveAgentKnowledge: SaveAgentKnowledge = async (ctx, input) => {
    const parsedCtx = actionCtxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    // Usamos el valor parseado: viene normalizado (textos sin espacios sobrantes).
    const parsedInput = saveAgentKnowledgeInputSchema.safeParse(input);
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
      // company_id sale del ctx (servidor), nunca del navegador.
      result = await client.rpc("save_agent_section", {
        p_company_id: parsedCtx.data.company_id,
        p_action_id: parsedCtx.data.action_id,
        p_base_version: parsedInput.data.base_version,
        p_section: "knowledge",
        p_value: parsedInput.data.knowledge,
      });
    } catch (error) {
      logError("excepción al llamar a save_agent_section", error);
      return fail("PROVIDER_UNAVAILABLE", "No pudimos guardar. Revisá tu conexión y probá de nuevo.", true);
    }
    if (result.error) return translateSaveError(result.error, "save_agent_section");

    const output = saveAgentKnowledgeOutputSchema.safeParse(result.data);
    if (!output.success) return fail("PROVIDER_ERROR", "La base respondió algo inesperado al guardar.", false);
    return { ok: true, data: output.data };
  };

  return { saveAgentKnowledge };
}
