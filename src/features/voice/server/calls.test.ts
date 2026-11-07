import { describe, expect, it } from "vitest";
import { DispatchDueCallsDataSchema, StartCallDataSchema } from "../../../contracts/voice";
import { dispatchDueCalls, mockCallId, startCall, type VoiceDeps } from "./calls";

const ctx = {
  company_id: "11111111-1111-4111-8111-111111111111",
  actor_type: "user" as const,
  actor_id: "22222222-2222-4222-8222-222222222222",
};
const actionCtx = { ...ctx, action_id: "start-call:test-1" };
const input = { contact_id: "33333333-3333-4333-8333-333333333333", objective: "Presentar la empresa" };
const mock: VoiceDeps = { mode: "mock", now: () => new Date("2026-11-07T15:00:00.000Z") };
const live: VoiceDeps = { ...mock, mode: "live" };

describe("startCall", () => {
  it("queues a mock call for the company in the verified context", async () => {
    const result = await startCall(actionCtx, input, mock);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(StartCallDataSchema.parse(result.data)).toStrictEqual(result.data);
    expect(result.data.call).toMatchObject({
      company_id: ctx.company_id,
      contact_id: input.contact_id,
      deal_id: null,
      transport: "mock",
      status: "queued",
      provider_call_id: null,
      created_at: "2026-11-07T15:00:00.000Z",
    });
  });

  it("returns the same call id when the same action is retried", async () => {
    const first = await startCall(actionCtx, input, mock);
    const retry = await startCall(actionCtx, input, mock);
    const other = await startCall({ ...actionCtx, action_id: "start-call:test-2" }, input, mock);

    expect(first.ok && retry.ok && other.ok).toBe(true);
    if (!first.ok || !retry.ok || !other.ok) return;
    expect(retry.data.call.id).toBe(first.data.call.id);
    expect(other.data.call.id).not.toBe(first.data.call.id);
    expect(mockCallId(ctx.company_id, actionCtx.action_id)).toBe(first.data.call.id);
  });

  it("rejects an invalid context or input before doing anything", async () => {
    const noAction = await startCall(ctx, input, mock);
    const notUuidCompany = await startCall({ ...actionCtx, company_id: "empresa-demo" }, input, mock);
    const identityInInput = await startCall(actionCtx, { ...input, company_id: ctx.company_id }, mock);

    for (const result of [noAction, notUuidCompany, identityInInput]) {
      expect(result).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR", retryable: false } });
    }
  });

  it("fails explicitly in live mode instead of falling back to mock", async () => {
    const result = await startCall(actionCtx, input, live);
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: false } });
  });
});

describe("dispatchDueCalls", () => {
  it("reports an empty batch in mock mode", async () => {
    const result = await dispatchDueCalls({ ...ctx, actor_type: "system" }, { limit: 5 }, mock);
    expect(result).toStrictEqual({ ok: true, data: { processed: 0, pending: 0, failed: 0 } });
    if (result.ok) expect(DispatchDueCallsDataSchema.parse(result.data)).toStrictEqual(result.data);
  });

  it("validates the batch size and fails explicitly in live mode", async () => {
    expect(await dispatchDueCalls(ctx, { limit: 50 }, mock)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await dispatchDueCalls(ctx, { limit: 5 }, live)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
});
