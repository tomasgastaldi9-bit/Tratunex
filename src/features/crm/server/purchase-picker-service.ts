import { z } from "zod";
import { ctxSchema, resultSchema, type Ctx, type Result } from "../../../contracts/common";
import { purchaseRequestSchema } from "../../../contracts/purchases";
import { crmFailure } from "./persistent-crm";

const identity = ctxSchema.extend({ company_id: z.uuid(), actor_id: z.uuid(), actor_type: z.literal("user") });
export const PURCHASE_CHOICES_MAX_PAGE = 1000;
export const PurchasePickerInputSchema = z.object({ page: z.number().int().min(0).max(PURCHASE_CHOICES_MAX_PAGE).default(0) }).strict();
const choiceSchema = purchaseRequestSchema.pick({ id: true, product: true, quantity: true, unit: true, needed_by: true })
  .extend({ company_id: z.uuid() });
export type PurchaseChoice = z.infer<typeof choiceSchema>;
export type PurchaseChoicesPage = { items: PurchaseChoice[]; page: number; has_next: boolean; limit_reached?: true };
type ReadChoices = (ctx: Ctx, page: { offset: number; limit: number }) => Promise<Result<unknown>>;
export const PURCHASE_CHOICES_PAGE_SIZE = 20;

/** Only a selection index. BUY-01 remains authoritative for the selected purchase. */
export function createPurchasePickerService(read: ReadChoices) {
  return async (ctx: Ctx, input: { page?: number } = {}): Promise<Result<PurchaseChoicesPage>> => {
    const user = identity.safeParse(ctx);
    const parsed = PurchasePickerInputSchema.safeParse(input);
    if (!user.success || !parsed.success) return crmFailure("VALIDATION_ERROR", "Revisá la página de compras y la empresa activa.");
    try {
      const result = resultSchema(z.array(choiceSchema).max(PURCHASE_CHOICES_PAGE_SIZE + 1)).safeParse(await read(user.data, {
        offset: parsed.data.page * PURCHASE_CHOICES_PAGE_SIZE, limit: PURCHASE_CHOICES_PAGE_SIZE + 1,
      }));
      if (!result.success) return crmFailure("PROVIDER_ERROR", "La lista de compras devolvió datos incompatibles.");
      if (!result.data.ok) return result.data;
      if (result.data.data.some(row => row.company_id !== ctx.company_id)) return crmFailure("PROVIDER_ERROR", "La lista no corresponde a la empresa activa.");
      const more = result.data.data.length > PURCHASE_CHOICES_PAGE_SIZE;
      const atLimit = parsed.data.page === PURCHASE_CHOICES_MAX_PAGE;
      return { ok: true, data: { items: result.data.data.slice(0, PURCHASE_CHOICES_PAGE_SIZE), page: parsed.data.page,
        has_next: more && !atLimit, ...(more && atLimit ? { limit_reached: true as const } : {}) } };
    } catch {
      return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo consultar la lista de compras.", true);
    }
  };
}
