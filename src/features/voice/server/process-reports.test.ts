import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../../contracts/common";
import type { CallResultV1 } from "../../../contracts/voice";
import { CALL_ANALYSIS_OUTPUT_NAME, type KnownCall } from "./call-analysis";
import {
  extractCallArtifacts,
  processPendingReports,
  recordCallResultActionId,
  type CallOutcome,
  type PendingReport,
  type RecordCallResult,
  type ReportStore,
} from "./process-reports";

const call: KnownCall = {
  id: "66666666-6666-4666-8666-666666666666",
  company_id: "11111111-1111-4111-8111-111111111111",
  contact_id: "33333333-3333-4333-8333-333333333333",
  deal_id: null,
  agent_version: 1,
  provider_call_id: "vapi-call-1",
};
const now = () => new Date("2026-11-07T16:00:00.000Z");

function report(endedReason = "customer-ended-call", analysis: unknown = {
  spoke_with_person: true,
  is_potential_client: "yes",
  outcome: "interested",
  do_not_contact_requested: false,
  score: 75,
  summary: "Atendió el dueño y pidió precios.",
}) {
  return {
    message: {
      type: "end-of-call-report",
      endedReason,
      artifact: {
        transcript: "Agente: Hola\nCliente: Hola",
        recordingUrl: "https://storage.vapi.ai/rec-1.wav",
        structuredOutputs: { "so-1": { name: CALL_ANALYSIS_OUTPUT_NAME, result: analysis } },
      },
      call: { id: "vapi-call-1", endedAt: "2026-11-07T15:21:00.000Z" },
    },
  };
}

function memoryStore(reports: PendingReport[]) {
  const state = {
    pending: [...reports],
    processed: [] as number[],
    failures: [] as Array<{ id: number; error: string }>,
    released: [] as number[],
    outcomes: [] as Array<{ callId: string; outcome: CallOutcome }>,
  };
  const store: ReportStore = {
    claimPendingReports: async (limit) => state.pending.splice(0, limit),
    saveCallOutcome: async (callId, outcome) => {
      state.outcomes.push({ callId, outcome });
    },
    markProcessed: async (pending) => {
      state.processed.push(pending.id);
    },
    markFailed: async (pending, error) => {
      state.failures.push({ id: pending.id, error });
      state.pending.push({ ...pending, attempts: pending.attempts + 1 });
    },
    release: async (pending) => {
      state.released.push(pending.id);
    },
  };
  return { store, state };
}

function crm(result: Awaited<ReturnType<RecordCallResult>> = { ok: true, data: {} }) {
  return vi.fn<(ctx: ActionCtx, input: CallResultV1) => Promise<Awaited<ReturnType<RecordCallResult>>>>(async () => result);
}

const pending = (overrides: Partial<PendingReport> = {}): PendingReport => ({
  id: 1,
  provider_event_id: "vapi:vapi-call-1:end-of-call-report",
  payload: report(),
  attempts: 0,
  call,
  ...overrides,
});

describe("processPendingReports", () => {
  it("saves the outcome on the call and delivers the result to the CRM with a stable action id", async () => {
    const { store, state } = memoryStore([pending()]);
    const recordCallResult = crm();

    const summary = await processPendingReports({ store, recordCallResult, now }, 5);

    expect(summary).toStrictEqual({ processed: 1, pending: 0, failed: 0 });
    expect(state.processed).toStrictEqual([1]);
    expect(state.outcomes[0]).toMatchObject({
      callId: call.id,
      outcome: {
        status: "completed",
        ended_at: "2026-11-07T15:21:00.000Z",
        ended_reason: "customer-ended-call",
        recording_url: "https://storage.vapi.ai/rec-1.wav",
        transcript: "Agente: Hola\nCliente: Hola",
        result: { outcome: "interested", answered_by: "human", call_id: call.id },
      },
    });
    expect(recordCallResult).toHaveBeenCalledWith(
      {
        company_id: call.company_id,
        actor_type: "voice",
        actor_id: call.id,
        action_id: "voice:record-call-result:vapi:vapi-call-1:end-of-call-report",
      },
      expect.objectContaining({ event_id: "vapi:vapi-call-1:end-of-call-report", company_id: call.company_id }),
    );
  });

  it("leaves reports without a known call pending, without counting an attempt", async () => {
    const { store, state } = memoryStore([pending({ call: null })]);
    const summary = await processPendingReports({ store, recordCallResult: crm(), now }, 5);

    expect(summary).toStrictEqual({ processed: 0, pending: 1, failed: 0 });
    expect(state.released).toStrictEqual([1]);
    expect(state.failures).toHaveLength(0);
  });

  it("keeps the report pending when the CRM fails and reuses the same action id on retry", async () => {
    const { store, state } = memoryStore([pending()]);
    const failing = crm({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "CRM caído", retryable: true } });

    expect(await processPendingReports({ store, recordCallResult: failing, now }, 5)).toStrictEqual({ processed: 0, pending: 0, failed: 1 });
    expect(state.failures[0].error).toContain("PROVIDER_UNAVAILABLE");
    expect(state.processed).toHaveLength(0);

    const working = crm();
    expect(await processPendingReports({ store, recordCallResult: working, now }, 5)).toStrictEqual({ processed: 1, pending: 0, failed: 0 });
    expect(failing.mock.calls[0][0].action_id).toBe(working.mock.calls[0][0].action_id);
    expect(working.mock.calls[0][0].action_id).toBe(recordCallResultActionId("vapi:vapi-call-1:end-of-call-report"));
  });

  it("marks invalid reports and storage errors as failed instead of delivering them", async () => {
    const wrongCall = pending({ id: 2, call: { ...call, provider_call_id: "otra" } });
    const { store, state } = memoryStore([wrongCall]);
    const recordCallResult = crm();

    expect(await processPendingReports({ store, recordCallResult, now }, 5)).toMatchObject({ failed: 1 });
    expect(recordCallResult).not.toHaveBeenCalled();

    const broken = memoryStore([pending({ id: 3 })]);
    broken.store.saveCallOutcome = async () => {
      throw new Error("db down");
    };
    expect(await processPendingReports({ store: broken.store, recordCallResult, now }, 5)).toMatchObject({ failed: 1 });
    expect(broken.state.failures[0]).toStrictEqual({ id: 3, error: "db down" });
    expect(state.failures[0].id).toBe(2);
  });

  it("stores voicemail and technical failures without commercial interest", async () => {
    const { store, state } = memoryStore([
      pending({ id: 4, payload: report("voicemail") }),
      pending({ id: 5, provider_event_id: "vapi:vapi-call-1:end-of-call-report:b", payload: report("twilio-failed-to-connect-call") }),
    ]);
    await processPendingReports({ store, recordCallResult: crm(), now }, 5);

    expect(state.outcomes[0].outcome).toMatchObject({ status: "completed", result: { answered_by: "voicemail", outcome: "not_assessed" } });
    expect(state.outcomes[1].outcome).toMatchObject({ status: "failed", result: { technical_status: "failed", outcome: "not_assessed" } });
  });
});

describe("extractCallArtifacts", () => {
  it("reads recording, transcript and ended reason where Vapi puts them", () => {
    expect(extractCallArtifacts(report())).toStrictEqual({
      recording_url: "https://storage.vapi.ai/rec-1.wav",
      transcript: "Agente: Hola\nCliente: Hola",
      ended_reason: "customer-ended-call",
    });
    expect(
      extractCallArtifacts({ message: { call: { endedReason: "voicemail", artifact: { recording: { url: "https://x.test/a.mp3" } } } } }),
    ).toStrictEqual({ recording_url: "https://x.test/a.mp3", transcript: null, ended_reason: "voicemail" });
    expect(extractCallArtifacts({ message: { artifact: { recordingUrl: "javascript:alert(1)" } } }).recording_url).toBeNull();
    expect(extractCallArtifacts(null)).toStrictEqual({ recording_url: null, transcript: null, ended_reason: null });
  });
});
