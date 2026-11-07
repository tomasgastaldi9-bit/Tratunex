import type { ActionCtx, Ctx } from "../../../contracts/common";
import {
  UpsertContactInputSchema, UpdateContactInputSchema, GetContactInputSchema,
  UpsertSupplierDataSchema, SupplierDataSchema, SupplierListInputSchema, SupplierPageSchema,
  SetSupplierWalletInputSchema, type UpsertContactInput, type UpdateContactInput,
  type GetContactInput, type SupplierListInput, type SetSupplierWalletInput,
} from "../../../contracts/crm";
import { createCrmOperationCaller, crmFailure, type CrmExecutor } from "./persistent-crm";

export function createSuppliersCrm(execute: CrmExecutor) {
  const call = createCrmOperationCaller(execute);
  const isAutomatedActor = (ctx: Ctx) => ctx.actor_type === "voice" || ctx.actor_type === "system";
  return {
    upsertSupplier: (ctx: ActionCtx, input: UpsertContactInput) => call(ctx, "upsertSupplier", input, UpsertContactInputSchema, UpsertSupplierDataSchema),
    updateSupplier: (ctx: ActionCtx, input: UpdateContactInput) => isAutomatedActor(ctx)
      ? Promise.resolve(crmFailure<never>("FORBIDDEN", "La edición del proveedor requiere una persona autenticada."))
      : call(ctx, "updateSupplier", input, UpdateContactInputSchema, SupplierDataSchema),
    setSupplierWallet: (ctx: ActionCtx, input: SetSupplierWalletInput) => isAutomatedActor(ctx)
      ? Promise.resolve(crmFailure<never>("FORBIDDEN", "Solo una persona puede cambiar la billetera de cobro."))
      : call(ctx, "setSupplierWallet", input, SetSupplierWalletInputSchema, SupplierDataSchema),
    getSupplier: (ctx: Ctx, input: GetContactInput) => call(ctx, "getSupplier", input, GetContactInputSchema, SupplierDataSchema, false),
    listSuppliers: (ctx: Ctx, input: SupplierListInput) => call(ctx, "listSuppliers", input, SupplierListInputSchema, SupplierPageSchema, false),
  };
}
