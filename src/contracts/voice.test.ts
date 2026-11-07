import { describe, expect, it } from "vitest";
import { callDtoFixture, callResultFixtures } from "../features/voice/fixtures";
import {
  CallDTOSchema,
  CallResultV1Schema,
  DispatchDueCallsInputSchema,
  NormalizedCallResultV1Schema,
  StartCallInputSchema,
} from "./voice";

const contactId = "33333333-3333-4333-8333-333333333333";

describe("voice contracts", () => {
  it("accepts every call result fixture as a normalized CallResultV1", () => {
    for (const [name, fixture] of Object.entries(callResultFixtures)) {
      expect(NormalizedCallResultV1Schema.safeParse(fixture).success, name).toBe(true);
    }
    expect(CallDTOSchema.parse(callDtoFixture)).toStrictEqual(callDtoFixture);
  });

  it("requires a UTC date for a callback", () => {
    const { callbackRequested } = callResultFixtures;
    const withoutDate = { ...callbackRequested, next_action: { ...callbackRequested.next_action, due_at: null } };
    expect(CallResultV1Schema.safeParse(withoutDate).success).toBe(false);

    const withOffset = { ...callbackRequested, next_action: { ...callbackRequested.next_action, due_at: "2026-11-12T14:00:00-03:00" } };
    expect(CallResultV1Schema.safeParse(withOffset).success).toBe(false);
  });

  it("never treats a voicemail or a failed call as commercial interest", () => {
    const voicemailInterested = { ...callResultFixtures.voicemail, outcome: "interested", is_potential_client: "yes" };
    expect(CallResultV1Schema.safeParse(voicemailInterested).success).toBe(true);
    expect(NormalizedCallResultV1Schema.safeParse(voicemailInterested).success).toBe(false);

    const failedWithScore = { ...callResultFixtures.technicalFailure, score: 40 };
    expect(NormalizedCallResultV1Schema.safeParse(failedWithScore).success).toBe(false);

    const voicemailDoNotContact = { ...callResultFixtures.voicemail, do_not_contact_requested: true };
    expect(NormalizedCallResultV1Schema.safeParse(voicemailDoNotContact).success).toBe(false);
  });

  it("rejects out of range scores and unstable event ids", () => {
    expect(CallResultV1Schema.safeParse({ ...callResultFixtures.interested, score: 101 }).success).toBe(false);
    expect(CallResultV1Schema.safeParse({ ...callResultFixtures.interested, event_id: " evt-1 " }).success).toBe(false);
  });

  it("keeps identity out of the startCall input", () => {
    expect(StartCallInputSchema.parse({ contact_id: contactId })).toStrictEqual({ contact_id: contactId });
    expect(StartCallInputSchema.safeParse({ contact_id: contactId, company_id: contactId }).success).toBe(false);
    expect(StartCallInputSchema.safeParse({ contact_id: "contact_demo" }).success).toBe(false);
    expect(StartCallInputSchema.safeParse({ contact_id: contactId, objective: "x".repeat(501) }).success).toBe(false);
  });

  it("limits the cron batch to five calls", () => {
    expect(DispatchDueCallsInputSchema.safeParse({ limit: 5 }).success).toBe(true);
    expect(DispatchDueCallsInputSchema.safeParse({ limit: 6 }).success).toBe(false);
    expect(DispatchDueCallsInputSchema.safeParse({ limit: 0 }).success).toBe(false);
  });
});
