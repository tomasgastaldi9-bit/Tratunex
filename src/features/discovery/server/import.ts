import "server-only";
import { z } from "zod";
import type { ActionCtx, Result } from "@/contracts/common";
import type { UpsertContactInput } from "@/contracts/crm";
import { upsertContact } from "@/features/crm/server/public";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { importBatch } from "../import/batch";
import { parseProspectCsv } from "../import/csv";
import { csvRecordToContact, mapPersistedCandidates } from "../import/mapping";
import type { ProspectCandidate } from "@/contracts/discovery";

const fail = (message: string): Result<never> => ({ ok: false, error: { code: "VALIDATION_ERROR", message, retryable: false } });

export async function importProspects(ctx: ActionCtx, request: { csv: string } | { candidate_ids: string[] }) {
  if (!z.uuid().safeParse(ctx.action_id).success) return fail("Identificador de importación inválido.");
  const db = await createRequestSupabaseClient();
  const inputs: UpsertContactInput[] = [];
  if ("csv" in request) {
    const csv = parseProspectCsv(request.csv);
    if (!csv.ok) return fail(csv.error);
    for (const row of csv.rows) {
      const mapped = csvRecordToContact(row);
      if (!mapped.ok) return fail(`Registro ${row.row}: ${mapped.error.message}`);
      inputs.push(mapped.data);
    }
  } else {
    const ids = z.array(z.uuid()).min(1).max(500).refine(v => new Set(v).size === v.length).safeParse(request.candidate_ids);
    if (!ids.success) return fail("Seleccioná prospectos válidos.");
    const { data, error } = await db.from("prospect_candidates").select("id,name,phone,website,source_url,evidence,prospect_searches!inner(mode)").eq("company_id", ctx.company_id).in("id", ids.data);
    if (error || !data || data.length !== ids.data.length) return fail("No se pudieron consultar los prospectos de esta empresa.");
    const mapped = mapPersistedCandidates(ids.data, data as unknown as (ProspectCandidate & { id: string; prospect_searches: { mode: "live" | "mock" } })[]);
    if (!mapped.ok) return mapped;
    inputs.push(...mapped.data);
  }
  return importBatch(ctx, inputs, {
    reserve: async (context, items) => {
      const { error } = await db.rpc("reserve_prospect_import", { p_company: context.company_id, p_action: context.action_id, p_inputs: items });
      if (error) return { ok: false, error: { code: error.message.includes("CONFLICT") ? "CONFLICT" : "PROVIDER_UNAVAILABLE", message: error.message.includes("CONFLICT") ? "Esta acción ya se usó con otros datos." : "No se pudo reservar la importación. Conservá la acción para reintentar.", retryable: !error.message.includes("CONFLICT") } };
      return { ok: true, data: null };
    },
    upsert: upsertContact,
  });
}
