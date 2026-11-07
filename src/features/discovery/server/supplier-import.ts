import "server-only";
import { z } from "zod";
import type { ActionCtx, Result } from "@/contracts/common";
import { upsertSupplier } from "@/features/crm/server/public";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import type { ProspectCandidate } from "@/contracts/discovery";
import { toContactInput } from "../import/mapping";

export async function addSupplierFromCandidate(ctx: ActionCtx, candidateId: unknown, rawPhone: unknown) {
  if (!z.uuid().safeParse(ctx.action_id).success || !z.uuid().safeParse(candidateId).success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "La acción o el proveedor seleccionado no son válidos.", retryable: false } } satisfies Result<never>;
  }
  if (typeof rawPhone !== "string") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Ingresá un teléfono con código de país, por ejemplo +54 9 351 123 4567.", retryable: false } } satisfies Result<never>;
  }
  const db = await createRequestSupabaseClient();
  const { data, error } = await db.from("prospect_candidates")
    .select("id,name,phone,website,source_url,evidence,products,prices,prospect_searches!inner(mode)")
    .eq("company_id", ctx.company_id).eq("id", candidateId).maybeSingle();
  if (error || !data) {
    return { ok: false, error: { code: "NOT_FOUND", message: "No se encontró ese candidato en la empresa activa.", retryable: false } } satisfies Result<never>;
  }
  const row = data as unknown as ProspectCandidate & { id: string; prospect_searches: { mode: "live" | "mock" } };
  if (row.prospect_searches.mode !== "live") {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Los resultados de ejemplo no se pueden agregar como proveedores reales.", retryable: false } } satisfies Result<never>;
  }
  const candidate = toContactInput({ ...row, phone: rawPhone.trim() }, "live");
  if (!candidate.ok) return candidate;
  return upsertSupplier(ctx, candidate.data);
}
