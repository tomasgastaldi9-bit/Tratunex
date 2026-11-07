import type { ActionCtx, Result } from "../../../contracts/common";
import type { UpsertContactInput } from "../../../contracts/crm";

type Outcome = { imported: number; existing: number; failed: number; contact_ids: string[]; errors: { row: number; message: string; retryable: boolean }[] };
type Dependencies = {
  reserve: (ctx: ActionCtx, inputs: UpsertContactInput[]) => Promise<Result<null>>;
  upsert: (ctx: ActionCtx, input: UpsertContactInput) => Promise<Result<{ created: boolean; contact: { id: string } }>>;
};

export async function importBatch(ctx: ActionCtx, inputs: UpsertContactInput[], deps: Dependencies): Promise<Result<Outcome>> {
  if (!inputs.length || inputs.length > 500) return { ok: false, error: { code: "VALIDATION_ERROR", message: "Seleccioná entre 1 y 500 contactos.", retryable: false } };
  const reserved = await deps.reserve(ctx, inputs);
  if (!reserved.ok) return reserved;
  const data: Outcome = { imported: 0, existing: 0, failed: 0, contact_ids: [], errors: [] };
  for (const [index, input] of inputs.entries()) {
    const result = await deps.upsert({ ...ctx, action_id: `discovery-item:${ctx.action_id}:${index}` }, input);
    if (!result.ok) { data.failed++; data.errors.push({ row: index + 1, message: result.error.message, retryable: result.error.retryable }); continue; }
    if (result.data.created) data.imported++; else data.existing++;
    data.contact_ids.push(result.data.contact.id);
  }
  return { ok: true, data };
}
