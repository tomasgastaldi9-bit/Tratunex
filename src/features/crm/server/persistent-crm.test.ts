import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../../contracts/common";
import { UpsertContactInputSchema } from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import { createPersistentCrm, databaseFailure } from "./persistent-crm";

const ctx: ActionCtx = { company_id: fixtures.companies[0].id, actor_type: "user", actor_id: "90000000-0000-4000-8000-000000000001", action_id: "stable-user-action" };
const contact = fixtures.contacts[0];
const input = UpsertContactInputSchema.parse({ name: contact.name, organization: contact.organization, phone_e164: contact.phone_e164, website: contact.website, source: contact.source });

describe("CRM persistent RPC adapter", () => {
  it("sends context separate from payload and preserves stable action identifiers", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { contact, created: false } }, error: null }));
    const crm = createPersistentCrm(execute);
    const result = await crm.upsertContact(ctx, input);
    expect(result).toEqual({ ok: true, data: { contact: { ...contact, created_at: new Date(contact.created_at).toISOString(), updated_at: new Date(contact.updated_at).toISOString() }, created: false } });
    await crm.upsertContact(ctx, input);
    expect(execute).toHaveBeenNthCalledWith(1, ctx, "upsertContact", input);
    expect(execute).toHaveBeenNthCalledWith(2, ctx, "upsertContact", input);
  });
  it("rejects identity injection and invalid persistent actor IDs before the database", async () => {
    const execute = vi.fn();
    const crm = createPersistentCrm(execute);
    expect(await crm.upsertContact(ctx, { ...input, company_id: fixtures.companies[1].id } as typeof input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.upsertContact({ ...ctx, actor_id: "model-decided" }, input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(execute).not.toHaveBeenCalled();
  });
  it("normalizes actual timestamp offsets without changing provider identifiers", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { contact: { ...contact, created_at: "2026-11-05T09:00:00-03:00", updated_at: "2026-11-07T14:59:30+00:00" } } }, error: null }));
    const result = await createPersistentCrm(execute).getContact(ctx, { contact_id: contact.id });
    expect(result).toMatchObject({ ok: true, data: { contact: { id: contact.id, created_at: "2026-11-05T12:00:00.000Z", updated_at: "2026-11-07T14:59:30.000Z" } } });
    expect(execute).toHaveBeenCalledWith({ company_id: ctx.company_id, actor_type: ctx.actor_type, actor_id: ctx.actor_id }, "getContact", { contact_id: contact.id });
  });
  it("never substitutes fixtures when the schema is not installed", async () => {
    const execute = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find public.crm_execute" } }));
    expect(await createPersistentCrm(execute).getContact(ctx, { contact_id: contact.id })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
  it("does not turn malformed database output into success", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { contact: { id: contact.id } } }, error: null }));
    expect(await createPersistentCrm(execute).getContact(ctx, { contact_id: contact.id })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
  it("never returns a foreign-company DTO even when the provider returns a valid shape", async () => {
    const foreign = fixtures.contacts.find(item => item.company_id !== ctx.company_id)!;
    const execute = vi.fn(async () => ({ data: { ok: true, data: { contact: foreign } }, error: null }));
    const result = await createPersistentCrm(execute).getContact(ctx, { contact_id: contact.id });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain(foreign.name);
  });
  it("rejects a foreign-company contact nested inside an otherwise valid list page", async () => {
    const foreign = fixtures.contacts.find(item => item.company_id !== ctx.company_id)!;
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [contact, foreign], next_cursor: null } }, error: null }));
    const result = await createPersistentCrm(execute).listContacts(ctx, { limit: 50 });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain(foreign.name);
  });
  it("passes normalized list filters to the RPC without requiring or forwarding an action ID", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [], next_cursor: null } }, error: null }));
    const result = await createPersistentCrm(execute).listContacts(ctx, { limit: 50, query: "  Demo  ", source: "csv", do_not_contact: "true" });
    expect(result).toEqual({ ok: true, data: { items: [], next_cursor: null } });
    expect(execute).toHaveBeenCalledWith(
      { company_id: ctx.company_id, actor_type: ctx.actor_type, actor_id: ctx.actor_id },
      "listContacts", { limit: 50, query: "Demo", source: "csv", do_not_contact: "true" },
    );
  });
  it("validates explicit edit IDs and rejects injected authority before executing the RPC", async () => {
    const execute = vi.fn();
    const crm = createPersistentCrm(execute);
    expect(await crm.updateContact(ctx, { ...input, contact_id: "invalid" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.updateContact(ctx, { ...input, contact_id: contact.id, company_id: fixtures.companies[1].id } as typeof input & { contact_id: string })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(execute).not.toHaveBeenCalled();
  });
  it("retains explicit errors from transactional SQL and does not leak raw SQL failures", async () => {
    expect(databaseFailure({ code: "P0001", message: "CONFLICT: Esta acción ya tiene otros datos." })).toMatchObject({ ok: false, error: { code: "CONFLICT", message: "Esta acción ya tiene otros datos." } });
    expect(databaseFailure({ code: "XX000", message: "secret: raw SQL details" })).not.toHaveProperty("error.message", "secret: raw SQL details");
    const execute = vi.fn(async () => ({ data: { ok: false, error: { code: "CONFLICT", message: "Dominio ocupado", retryable: false } }, error: null }));
    expect(await createPersistentCrm(execute).upsertContact(ctx, input)).toEqual({ ok: false, error: { code: "CONFLICT", message: "Dominio ocupado", retryable: false } });
  });
  it("an unconfirmed network result stays ambiguous and is never automatically retried", async () => {
    const execute = vi.fn(async () => { throw new Error("connection reset"); });
    expect(await createPersistentCrm(execute).upsertContact(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
