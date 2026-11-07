import type { ActionCtx, Ctx } from "../../../contracts/common";
import {
  CreateDealInputSchema, DealDataSchema, SetDealStageInputSchema,
  DealListInputSchema, DealPageSchema, ActivityListInputSchema, ActivityPageSchema,
  type CreateDealInput, type SetDealStageInput, type DealListInput, type ActivityListInput,
} from "../../../contracts/crm";
import { createCrmOperationCaller, type CrmExecutor } from "./persistent-crm";

export function createPipelineCrm(execute: CrmExecutor) {
  const call = createCrmOperationCaller(execute);
  return {
    createDeal: (ctx: ActionCtx, input: CreateDealInput) => call(ctx, "createDeal", input, CreateDealInputSchema, DealDataSchema),
    setDealStage: (ctx: ActionCtx, input: SetDealStageInput) => call(ctx, "setDealStage", input, SetDealStageInputSchema, DealDataSchema),
    listDeals: (ctx: Ctx, input: DealListInput) => call(ctx, "listDeals", input, DealListInputSchema, DealPageSchema, false),
    listActivities: (ctx: Ctx, input: ActivityListInput) => call(ctx, "listActivities", input, ActivityListInputSchema, ActivityPageSchema, false),
  };
}
