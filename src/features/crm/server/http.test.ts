import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Ctx, Result } from "../../../contracts/common";
import { handleCrmMutation, parseCrmMutation } from "./http";

const ctx: Ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "90000000-0000-4000-8000-000000000001", actor_type: "user" };
const schema = z.object({ name: z.string().min(1) }).strict();
const request = (body: unknown, headers: Record<string, string> = {}) => new Request("https://crm.example/api/crm/contacts", {
  method: "POST", headers: { "Content-Type": "application/json", Origin: "https://crm.example", ...headers }, body: JSON.stringify(body),
});
const authenticated = async (): Promise<Result<Ctx>> => ({ ok: true, data: ctx });

describe("CRM authenticated HTTP mutations", () => {
  it("binds identity to the verified server context and action to the envelope", async () => {
    const action = vi.fn(async () => ({ ok: true as const, data: { saved: true } }));
    const response = await handleCrmMutation(request({ action_id: "stable-1", input: { name: "Demo" } }), schema, authenticated, action);
    expect(response.status).toBe(200);
    expect(action).toHaveBeenCalledWith({ ...ctx, action_id: "stable-1" }, { name: "Demo" });
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Vary")).toBe("Cookie");
  });
  it.each(["https://attacker.example", "null", ""])("rejects a cross-site or absent origin %s before touching auth or data", async origin => {
    const context = vi.fn(authenticated);
    const action = vi.fn();
    const response = await handleCrmMutation(request({ action_id: "a", input: { name: "Demo" } }, { Origin: origin }), schema, context, action);
    expect(response.status).toBe(403);
    expect(context).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
  });
  it("checks membership before processing the JSON", async () => {
    const denied = async (): Promise<Result<Ctx>> => ({ ok: false, error: { code: "FORBIDDEN", message: "Sin membresía", retryable: false } });
    const action = vi.fn();
    const invalid = new Request("https://crm.example/api/crm/contacts", { method: "POST", headers: { Origin: "https://crm.example", "Content-Type": "application/json" }, body: "invalid-json" });
    expect((await handleCrmMutation(invalid, schema, denied, action)).status).toBe(403);
    expect(action).not.toHaveBeenCalled();
  });
  it.each([
    { action_id: "a", input: { name: "Demo", company_id: "foreign" } },
    { action_id: "a", company_id: "foreign", input: { name: "Demo" } },
    { input: { name: "Demo" } },
  ])("rejects injected context or missing stable action: %j", async body => {
    const action = vi.fn();
    expect((await handleCrmMutation(request(body), schema, authenticated, action)).status).toBe(400);
    expect(action).not.toHaveBeenCalled();
  });
  it("rejects conflicting header and envelope action IDs", async () => {
    const result = await parseCrmMutation(request({ action_id: "a", input: { name: "Demo" } }, { "Idempotency-Key": "b" }), schema);
    expect(result).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
  });
  it("does not present an unconfirmed mutation as successful", async () => {
    const action = vi.fn(async () => { throw new Error("timeout after write"); });
    const response = await handleCrmMutation(request({ action_id: "a", input: { name: "Demo" } }), schema, authenticated, action);
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(action).toHaveBeenCalledTimes(1);
  });
});
