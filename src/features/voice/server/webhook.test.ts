import { describe, expect, it, vi } from "vitest";
import {
  handleVapiWebhook,
  isAuthorizedVapiRequest,
  stableVapiEventId,
  type VoiceEventRecord,
  type VoiceEventStore,
} from "./webhook";

const secret = "test-webhook-secret";
const authorization = `Bearer ${secret}`;

function memoryStore(knownCalls: string[] = []): VoiceEventStore & { saved: VoiceEventRecord[] } {
  const saved: VoiceEventRecord[] = [];
  return {
    saved,
    insert: vi.fn(async (event: VoiceEventRecord) => {
      const duplicate = saved.some((existing) => existing.provider_event_id === event.provider_event_id);
      if (!duplicate) saved.push(event);
      return { duplicate, resolved: event.provider_call_id !== null && knownCalls.includes(event.provider_call_id) };
    }),
  };
}

const endOfCall = JSON.stringify({ message: { type: "end-of-call-report", call: { id: "vapi-call-1" }, endedReason: "customer-ended-call" } });

describe("isAuthorizedVapiRequest", () => {
  it("accepts only the exact bearer secret", () => {
    expect(isAuthorizedVapiRequest(authorization, secret)).toBe(true);
    expect(isAuthorizedVapiRequest(`Bearer ${secret}x`, secret)).toBe(false);
    expect(isAuthorizedVapiRequest(secret, secret)).toBe(false);
    expect(isAuthorizedVapiRequest(null, secret)).toBe(false);
    expect(isAuthorizedVapiRequest(authorization, undefined)).toBe(false);
  });
});

describe("stableVapiEventId", () => {
  it("derives the same key for a resent event and different keys for different events", () => {
    expect(stableVapiEventId("end-of-call-report", "vapi-call-1", undefined, endOfCall)).toBe("vapi:vapi-call-1:end-of-call-report");
    expect(stableVapiEventId("status-update", "vapi-call-1", "ringing", "{}")).toBe("vapi:vapi-call-1:status-update:ringing");

    const hang = JSON.stringify({ message: { type: "hang", call: { id: "vapi-call-1" } } });
    expect(stableVapiEventId("hang", "vapi-call-1", undefined, hang)).toBe(stableVapiEventId("hang", "vapi-call-1", undefined, hang));
    expect(stableVapiEventId("hang", "vapi-call-1", undefined, hang)).not.toBe(stableVapiEventId("hang", "vapi-call-1", undefined, `${hang} `));
  });
});

describe("handleVapiWebhook", () => {
  it("rejects requests without the right bearer before reading the body", async () => {
    const store = memoryStore();
    const response = await handleVapiWebhook({ authorization: "Bearer otro", rawBody: "not json" }, { secret, store });

    expect(response.status).toBe(401);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("fails explicitly when the secret is not configured", async () => {
    const store = memoryStore();
    const response = await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret: undefined, store });

    expect(response.status).toBe(503);
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("stores an event once and reports the resend as a duplicate", async () => {
    const store = memoryStore(["vapi-call-1"]);
    const first = await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret, store });
    const resend = await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret, store });

    expect(first).toStrictEqual({ status: 200, body: { received: true, stored: true, event_type: "end-of-call-report", duplicate: false, resolved: true } });
    expect(resend).toMatchObject({ status: 200, body: { duplicate: true } });
    expect(store.saved).toHaveLength(1);
    expect(store.saved[0]).toMatchObject({ provider_call_id: "vapi-call-1", event_type: "end-of-call-report" });
  });

  it("keeps an event for an unknown call pending reconciliation", async () => {
    const store = memoryStore();
    const response = await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret, store });

    expect(response).toMatchObject({ status: 200, body: { stored: true, resolved: false } });
  });

  it("acknowledges noisy event types without storing them", async () => {
    const store = memoryStore();
    const body = JSON.stringify({ message: { type: "speech-update", call: { id: "vapi-call-1" } } });
    const response = await handleVapiWebhook({ authorization, rawBody: body }, { secret, store });

    expect(response).toStrictEqual({ status: 200, body: { received: true, stored: false } });
    expect(store.insert).not.toHaveBeenCalled();
  });

  it("rejects malformed bodies and never confirms an event it could not save", async () => {
    expect((await handleVapiWebhook({ authorization, rawBody: "{" }, { secret, store: memoryStore() })).status).toBe(400);
    expect((await handleVapiWebhook({ authorization, rawBody: "{}" }, { secret, store: memoryStore() })).status).toBe(400);
    expect((await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret, store: null })).status).toBe(503);

    const failing: VoiceEventStore = { insert: async () => { throw new Error("db down"); } };
    expect((await handleVapiWebhook({ authorization, rawBody: endOfCall }, { secret, store: failing })).status).toBe(500);
  });
});
