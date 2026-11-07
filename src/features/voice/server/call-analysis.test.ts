import { describe, expect, it } from "vitest";
import {
  CALL_ANALYSIS_OUTPUT_NAME,
  classifyEndedReason,
  normalizeEndOfCallReport,
  resolveCallbackDueAt,
  type CallAnalysisResult,
  type KnownCall,
} from "./call-analysis";

// Sábado 7 de noviembre de 2026, 12:21 en Argentina.
const endedAt = "2026-11-07T15:21:00.000Z";
const call: KnownCall = {
  id: "66666666-6666-4666-8666-666666666666",
  company_id: "11111111-1111-4111-8111-111111111111",
  contact_id: "33333333-3333-4333-8333-333333333333",
  deal_id: null,
  agent_version: 3,
  provider_call_id: "vapi-call-1",
};
const options = { eventId: "vapi:vapi-call-1:end-of-call-report", now: () => new Date("2026-11-07T16:00:00.000Z") };

const spoke: CallAnalysisResult = {
  spoke_with_person: true,
  is_potential_client: "yes",
  outcome: "interested",
  do_not_contact_requested: false,
  score: 80,
  summary: "Atendió la dueña. Le interesa y pidió la propuesta por mail.",
};

function report(analysis: unknown, endedReason = "customer-ended-call", via: "structuredOutputs" | "analysisPlan" = "structuredOutputs") {
  return {
    message: {
      type: "end-of-call-report",
      endedReason,
      ...(via === "analysisPlan" ? { analysis: { structuredData: analysis } } : {}),
      artifact:
        via === "structuredOutputs"
          ? { structuredOutputs: { "so-1": { name: CALL_ANALYSIS_OUTPUT_NAME, result: analysis } } }
          : {},
      // Datos del aviso que no deben usarse como identidad.
      call: { id: "vapi-call-1", endedAt, metadata: { company_id: "99999999-9999-4999-8999-999999999999" } },
    },
  };
}

function due(analysis: Partial<CallAnalysisResult>, at = endedAt) {
  return resolveCallbackDueAt({ ...spoke, outcome: "callback_requested", ...analysis }, new Date(at));
}

describe("resolveCallbackDueAt", () => {
  it("turns a weekday and time said in Argentina into the next UTC date", () => {
    expect(due({ callback_day: "jueves", callback_time: "14:00" }).due_at).toBe("2026-11-12T17:00:00.000Z");
    expect(due({ callback_day: "manana", callback_time: "09:30" }).due_at).toBe("2026-11-08T12:30:00.000Z");
    expect(due({ callback_day: "hoy", callback_time: "18:00" }).due_at).toBe("2026-11-07T21:00:00.000Z");
    expect(due({ callback_day: "fecha_exacta", callback_date: "2026-12-01", callback_time: "15:30" }).due_at).toBe("2026-12-01T18:30:00.000Z");
  });

  it("moves the same weekday to next week and uses 10:00 when no hour was said", () => {
    expect(due({ callback_day: "sabado", callback_time: "11:00" }).due_at).toBe("2026-11-14T14:00:00.000Z");
    const noHour = due({ callback_day: "jueves" });
    expect(noHour.due_at).toBe("2026-11-12T13:00:00.000Z");
    expect(noHour.reason).toContain("sin hora");
  });

  it("uses the Argentine date even after UTC midnight", () => {
    // Sábado 23:30 en Argentina = domingo 02:30 UTC: "mañana" es el domingo.
    expect(due({ callback_day: "manana", callback_time: "10:00" }, "2026-11-08T02:30:00.000Z").due_at).toBe("2026-11-08T13:00:00.000Z");
  });

  it("asks for human review instead of inventing a date", () => {
    expect(due({ callback_day: "no_especificado" }).due_at).toBeNull();
    expect(due({}).due_at).toBeNull();
    expect(due({ callback_day: "hoy", callback_time: "09:00" }).due_at).toBeNull();
    expect(due({ callback_day: "jueves", callback_time: "25:00" }).due_at).toBeNull();
    expect(due({ callback_day: "fecha_exacta", callback_date: "2026-02-30" }).due_at).toBeNull();
    expect(due({ callback_day: "fecha_exacta" }).due_at).toBeNull();
  });
});

describe("classifyEndedReason", () => {
  it("separates conversations, voicemail, no answer and technical failures", () => {
    expect(classifyEndedReason("customer-ended-call")).toBe("conversation");
    expect(classifyEndedReason("silence-timed-out")).toBe("conversation");
    expect(classifyEndedReason("voicemail")).toBe("voicemail");
    expect(classifyEndedReason("customer-did-not-answer")).toBe("no_answer");
    expect(classifyEndedReason("customer-busy")).toBe("no_answer");
    expect(classifyEndedReason("twilio-failed-to-connect-call")).toBe("failed");
    expect(classifyEndedReason("pipeline-error-openai-429-exceeded-quota")).toBe("failed");
    expect(classifyEndedReason("call.in-progress.error-providerfault-outbound-sip-408-request-timeout")).toBe("failed");
    expect(classifyEndedReason("call.start.error-subscription-insufficient-credits")).toBe("failed");
  });
});

describe("normalizeEndOfCallReport", () => {
  it("builds the result from the structured output and the stored call identity", () => {
    const result = normalizeEndOfCallReport(report(spoke), call, options);

    expect(result).toStrictEqual({
      ok: true,
      data: {
        schema_version: "1",
        event_id: options.eventId,
        occurred_at: endedAt,
        company_id: call.company_id,
        call_id: call.id,
        contact_id: call.contact_id,
        deal_id: null,
        agent_version: 3,
        technical_status: "completed",
        answered_by: "human",
        is_potential_client: "yes",
        outcome: "interested",
        do_not_contact_requested: false,
        score: 80,
        summary: spoke.summary,
        transcript_url: null,
        next_action: null,
      },
    });
  });

  it("also reads the deprecated analysisPlan location", () => {
    const result = normalizeEndOfCallReport(report(spoke, "assistant-ended-call", "analysisPlan"), call, options);
    expect(result).toMatchObject({ ok: true, data: { answered_by: "human", outcome: "interested" } });
  });

  it("never turns a voicemail, an unanswered or a failed call into interest", () => {
    const voicemail = normalizeEndOfCallReport(report(spoke, "voicemail"), call, options);
    expect(voicemail).toMatchObject({
      ok: true,
      data: { technical_status: "completed", answered_by: "voicemail", outcome: "not_assessed", is_potential_client: "unknown", score: null },
    });

    const noAnswer = normalizeEndOfCallReport(report(spoke, "customer-did-not-answer"), call, options);
    expect(noAnswer).toMatchObject({ ok: true, data: { technical_status: "completed", answered_by: "unknown", outcome: "not_assessed" } });

    const failed = normalizeEndOfCallReport(report(spoke, "twilio-failed-to-connect-call"), call, options);
    expect(failed).toMatchObject({ ok: true, data: { technical_status: "failed", answered_by: "unknown", outcome: "not_assessed" } });

    const machine = normalizeEndOfCallReport(report({ ...spoke, spoke_with_person: false }), call, options);
    expect(machine).toMatchObject({ ok: true, data: { answered_by: "unknown", outcome: "not_assessed", score: null } });
  });

  it("schedules 'llamame el jueves a las 14' as a callback with the right date", () => {
    const analysis = { ...spoke, outcome: "callback_requested", callback_day: "jueves", callback_time: "14:00" };
    const result = normalizeEndOfCallReport(report(analysis), call, options);
    expect(result).toMatchObject({
      ok: true,
      data: { outcome: "callback_requested", next_action: { type: "callback", due_at: "2026-11-12T17:00:00.000Z" } },
    });

    const alreadyScheduled = normalizeEndOfCallReport(report(analysis), call, { ...options, callbackAlreadyScheduled: true });
    expect(alreadyScheduled).toMatchObject({ ok: true, data: { next_action: null } });
  });

  it("sends unclear callbacks and buyers to a person", () => {
    const unclear = normalizeEndOfCallReport(report({ ...spoke, outcome: "callback_requested" }), call, options);
    expect(unclear).toMatchObject({ ok: true, data: { next_action: { type: "human_review", due_at: null } } });

    const buyer = normalizeEndOfCallReport(report({ ...spoke, outcome: "wants_to_buy", score: 95 }), call, options);
    expect(buyer).toMatchObject({ ok: true, data: { outcome: "wants_to_buy", next_action: { type: "human_review" } } });
  });

  it("keeps a do-not-contact request without a next action", () => {
    const analysis = { ...spoke, is_potential_client: "no", outcome: "not_interested", do_not_contact_requested: true, score: 0 };
    const result = normalizeEndOfCallReport(report(analysis), call, options);
    expect(result).toMatchObject({ ok: true, data: { do_not_contact_requested: true, next_action: null } });
  });

  it("asks for review when a conversation has no usable analysis", () => {
    const result = normalizeEndOfCallReport(report({ outcome: "interested" }), call, options);
    expect(result).toMatchObject({
      ok: true,
      data: { answered_by: "unknown", outcome: "not_assessed", next_action: { type: "human_review" } },
    });
  });

  it("rejects reports for another call or with the wrong shape", () => {
    expect(normalizeEndOfCallReport(report(spoke), { ...call, provider_call_id: "otra" }, options)).toMatchObject({
      ok: false,
      error: { code: "VALIDATION_ERROR" },
    });
    expect(normalizeEndOfCallReport({ message: { type: "status-update" } }, call, options)).toMatchObject({ ok: false });
  });
});

describe("Vapi configuration files", () => {
  it("keeps the JSON schema to paste in Vapi identical to the one the code expects", async () => {
    const { callAnalysisJsonSchema } = await import("./call-analysis");
    const json = (await import("../vapi/call-analysis.schema.json")).default;
    expect(json).toStrictEqual(JSON.parse(JSON.stringify(callAnalysisJsonSchema)));
  });
});
