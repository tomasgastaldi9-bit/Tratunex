import "server-only";
import type { ActionCtx, Ctx } from "../../../contracts/common";
import type {
  CallResultV1, ClaimDueFollowupsInput, CompleteFollowupInput, FailFollowupInput,
  GetContactInput, ScheduleFollowupInput, UpsertContactInput,
} from "../../../contracts/crm";
import { CRM_MOCK_INTEGRATION } from "./mock-crm";
import { mockCrm as mock } from "./mock-instance";

// Explicit integration surface for consumers. This is always a process-local mock.
// No credentials, persistent writes or live fallback exist in this adapter.
export const crmIntegration = CRM_MOCK_INTEGRATION;

export const getContact = (ctx: Ctx, input: GetContactInput) => mock.getContact(ctx, input);
export const upsertContact = (ctx: ActionCtx, input: UpsertContactInput) => mock.upsertContact(ctx, input);
export const recordCallResult = (ctx: ActionCtx, input: CallResultV1) => mock.recordCallResult(ctx, input);
export const scheduleFollowup = (ctx: ActionCtx, input: ScheduleFollowupInput) => mock.scheduleFollowup(ctx, input);
export const claimDueFollowups = (ctx: ActionCtx, input: ClaimDueFollowupsInput) => mock.claimDueFollowups(ctx, input);
export const completeFollowup = (ctx: ActionCtx, input: CompleteFollowupInput) => mock.completeFollowup(ctx, input);
export const failFollowup = (ctx: ActionCtx, input: FailFollowupInput) => mock.failFollowup(ctx, input);
