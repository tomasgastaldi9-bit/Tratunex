import { describe, expect, it } from "vitest";
import { CallListItemSchema, GetCallDataSchema, ListCallsDataSchema } from "../../../contracts/voice";
import { callDetailFixtures, callResultFixtures } from "../fixtures";
import {
  createMockCallReader,
  createSupabaseCallReader,
  decodeCallCursor,
  encodeCallCursor,
} from "./call-reads";
import { httpStatusFor, startCallActionId } from "./http";

const company = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const ctx = { company_id: company, actor_type: "user" as const, actor_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };
const contactA = "33333333-3333-4333-8333-333333333333";

describe("mock call reader", () => {
  const reader = createMockCallReader();

  it("lists example calls for the active company, newest first, without transcripts", async () => {
    const result = await reader.list(ctx, {});

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(ListCallsDataSchema.parse(result.data)).toStrictEqual(result.data);
    expect(result.data.items).toHaveLength(callDetailFixtures.length);
    expect(result.data.items.every((call) => call.company_id === company && call.transport === "mock")).toBe(true);
    expect(result.data.items.map((call) => call.created_at)).toStrictEqual(
      [...result.data.items.map((call) => call.created_at)].sort().reverse(),
    );
    expect(result.data.items.every((call) => !("transcript" in call))).toBe(true);
    expect(result.data.next_cursor).toBeNull();
  });

  it("filters by contact and pages with an opaque cursor", async () => {
    const byContact = await reader.list(ctx, { contact_id: contactA });
    expect(byContact.ok && byContact.data.items.every((call) => call.contact_id === contactA)).toBe(true);

    const first = await reader.list(ctx, { limit: 2 });
    expect(first.ok && first.data.items).toHaveLength(2);
    if (!first.ok || !first.data.next_cursor) throw new Error("expected a next page");
    const second = await reader.list(ctx, { limit: 2, cursor: first.data.next_cursor });
    if (!second.ok) throw new Error("expected the second page");
    expect(second.data.items.map((call) => call.id)).not.toContain(first.data.items[0].id);
    expect(second.data.items).toHaveLength(2);
  });

  it("returns a call with its transcript, or NOT_FOUND", async () => {
    const found = await reader.get(ctx, { call_id: "66666666-6666-4666-8666-666666666602" });
    expect(found.ok).toBe(true);
    if (found.ok) {
      expect(GetCallDataSchema.parse(found.data)).toStrictEqual(found.data);
      expect(found.data.call.transcript).toContain("jueves");
      expect(found.data.call.result?.company_id).toBe(company);
    }

    expect(await reader.get(ctx, { call_id: "77777777-7777-4777-8777-777777777777" })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });

  it("rejects invalid context, filters and cursors", async () => {
    expect(await reader.list({ ...ctx, company_id: "empresa" }, {})).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await reader.list(ctx, { company_id: company })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await reader.list(ctx, { cursor: "no-es-un-cursor" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await reader.get(ctx, { call_id: "contact_demo" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});

describe("call cursor", () => {
  it("round-trips and rejects garbage", () => {
    const call = { created_at: "2026-11-07T15:00:00.000Z", id: "66666666-6666-4666-8666-666666666601" };
    expect(decodeCallCursor(encodeCallCursor(call))).toStrictEqual(call);
    expect(decodeCallCursor("aG9sYQ")).toBeNull();
  });
});

describe("supabase call reader", () => {
  const row = {
    id: "66666666-6666-4666-8666-666666666601",
    company_id: company,
    contact_id: contactA,
    deal_id: null,
    source_task_id: null,
    provider_call_id: "vapi-call-1",
    transport: "phone",
    status: "completed",
    objective: "Presentar la empresa",
    agent_version: 2,
    ended_reason: "customer-ended-call",
    ended_at: null,
    recording_url: null,
    result: null,
    created_at: "2026-11-07T15:00:00+00:00",
    updated_at: "2026-11-07T15:02:00+00:00",
  };

  function fakeClient(rows: unknown[], error: unknown = null) {
    const calls: unknown[][] = [];
    const builder = {
      select: (...args: unknown[]) => (calls.push(["select", ...args]), builder),
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), builder),
      or: (...args: unknown[]) => (calls.push(["or", ...args]), builder),
      order: (...args: unknown[]) => (calls.push(["order", ...args]), builder),
      limit: (n: number) => (calls.push(["limit", n]), Promise.resolve({ data: rows, error })),
      maybeSingle: () => Promise.resolve({ data: rows[0] ?? null, error }),
    };
    const client = { from: (table: string) => (calls.push(["from", table]), builder) };
    return { client: client as never, calls };
  }

  it("reads the active company's calls and normalizes timestamps to UTC", async () => {
    const { client, calls } = fakeClient([row, { ...row, id: "66666666-6666-4666-8666-666666666600" }]);
    const result = await createSupabaseCallReader(client).list(ctx, { contact_id: contactA, limit: 1 });

    expect(calls).toContainEqual(["from", "calls"]);
    expect(calls).toContainEqual(["eq", "company_id", company]);
    expect(calls).toContainEqual(["eq", "contact_id", contactA]);
    expect(calls).toContainEqual(["limit", 2]);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.items).toHaveLength(1);
    expect(CallListItemSchema.parse(result.data.items[0])).toMatchObject({ created_at: "2026-11-07T15:00:00.000Z", result: null });
    expect(result.data.next_cursor).not.toBeNull();
  });

  it("returns the processed result, transcript and recording of a call", async () => {
    const result = { ...callResultFixtures.interested, company_id: company, call_id: row.id, contact_id: contactA, deal_id: null };
    const processed = {
      ...row,
      ended_at: "2026-11-07T15:02:00+00:00",
      recording_url: "https://storage.vapi.ai/rec-1.wav",
      transcript: "Agente: Hola",
      result,
    };
    const { client, calls } = fakeClient([processed]);
    const loaded = await createSupabaseCallReader(client).get(ctx, { call_id: row.id });

    expect(calls.find((call) => call[0] === "select")?.[1]).toContain("transcript");
    expect(loaded).toMatchObject({
      ok: true,
      data: {
        call: {
          ended_at: "2026-11-07T15:02:00.000Z",
          recording_url: "https://storage.vapi.ai/rec-1.wav",
          transcript: "Agente: Hola",
          result: { outcome: "interested", call_id: row.id },
        },
      },
    });
  });

  it("maps database errors and missing calls", async () => {
    expect(await createSupabaseCallReader(fakeClient([], { message: "down" }).client).list(ctx, {})).toMatchObject({
      ok: false,
      error: { code: "PROVIDER_UNAVAILABLE", retryable: true },
    });
    expect(await createSupabaseCallReader(fakeClient([]).client).get(ctx, { call_id: row.id })).toMatchObject({
      ok: false,
      error: { code: "NOT_FOUND" },
    });
  });
});

describe("voice http helpers", () => {
  it("maps Result codes to HTTP statuses", () => {
    expect(httpStatusFor({ ok: true, data: {} })).toBe(200);
    expect(httpStatusFor({ ok: true, data: {} }, 202)).toBe(202);
    expect(httpStatusFor({ ok: false, error: { code: "FORBIDDEN", message: "", retryable: false } })).toBe(403);
    expect(httpStatusFor({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "", retryable: true } })).toBe(503);
  });

  it("requires a clean Idempotency-Key to start a call", () => {
    expect(startCallActionId("3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90")).toBe("start-call:3f2a9c1e-5b7d-4e8a-9c21-7d4e5f6a8b90");
    expect(startCallActionId(null)).toBeNull();
    expect(startCallActionId("   ")).toBeNull();
    expect(startCallActionId("con espacios")).toBeNull();
    expect(startCallActionId("x".repeat(201))).toBeNull();
  });
});
