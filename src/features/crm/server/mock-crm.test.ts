import { describe, expect, it } from "vitest";
import type { ActionCtx, Result } from "../../../contracts/common";
import type { CallResultV1, UpsertContactInput } from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import { createMockCrm, type MockCrmSeed } from "./mock-crm";

const company = fixtures.companies[0].id;
const company2 = fixtures.companies[1].id;
const contactId = fixtures.contacts[0].id;
const dealId = fixtures.deals[0].id;
const callId = "90000000-0000-4000-8000-000000000001";
const ctx = (action_id = "action-1", company_id = company): ActionCtx => ({ company_id, actor_type: "user", actor_id: "demo-actor", action_id });
const freshInput = (): UpsertContactInput => ({ name: "Nuevo Demo", organization: "Nueva Empresa Ficticia", phone_e164: "+12025550199", website: "https://nuevo.example", source: { kind: "manual", label: "Fixture ficticio", url: null } });
const baseEvent = (overrides: Partial<CallResultV1> = {}): CallResultV1 => ({
  schema_version: "1", event_id: "mock:new-event", occurred_at: "2026-11-07T15:00:00Z",
  company_id: company, call_id: callId, contact_id: contactId, deal_id: dealId,
  agent_version: 1, technical_status: "completed", answered_by: "human",
  is_potential_client: "yes", outcome: "interested", do_not_contact_requested: false,
  score: 80, summary: "Resultado ficticio de prueba.", transcript_url: null, next_action: null, ...overrides,
});
function data<T>(result: Result<T>): T {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(result.error.message);
  return result.data;
}
function error(result: Result<unknown>, code: string) {
  expect(result).toMatchObject({ ok: false, error: { code, retryable: false } });
}
function seed(): MockCrmSeed { return createMockCrm().snapshot(); }

describe("CRM mock: contactos, contexto e idempotencia", () => {
  it("rotula la integración y devuelve snapshots aislados", () => {
    const service = createMockCrm();
    expect(service.integration).toMatchObject({ mode: "mock", persistence: "process" });
    service.snapshot().contacts[0].name = "mutación externa";
    expect(service.snapshot().contacts[0].name).toBe("Alicia Demo");
  });
  it("lee únicamente contactos de la empresa del contexto", async () => {
    const service = createMockCrm();
    expect(data(await service.getContact(ctx(), { contact_id: contactId })).contact.name).toBe("Alicia Demo");
    error(await service.getContact(ctx("read", company2), { contact_id: contactId }), "NOT_FOUND");
    error(await service.getContact(ctx("read", "no-es-una-empresa-demo"), { contact_id: contactId }), "FORBIDDEN");
    error(await service.getContact(ctx(), { contact_id: "invalid" }), "VALIDATION_ERROR");
  });
  it("crea un contacto y una oportunidad nueva; repetir no duplica", async () => {
    const service = createMockCrm();
    const first = await service.upsertContact(ctx(), freshInput());
    const second = await service.upsertContact(ctx(), { ...freshInput(), source: { url: null, label: "Fixture ficticio", kind: "manual" } });
    expect(second).toEqual(first);
    const created = data(first);
    expect(created.created).toBe(true);
    expect(service.snapshot().deals.filter((deal) => deal.contact_id === created.contact.id)).toMatchObject([{ stage: "new", company_id: company }]);
    expect(service.snapshot().contacts).toHaveLength(fixtures.contacts.length + 1);
    // Returned objects cannot mutate the stored receipt or contact.
    created.contact.name = "afuera";
    expect(data(await service.upsertContact(ctx(), freshInput())).contact.name).toBe("Nuevo Demo");
  });
  it("rechaza action_id con otro payload u operación y conserva el estado", async () => {
    const service = createMockCrm();
    await service.upsertContact(ctx(), freshInput());
    const before = service.snapshot();
    error(await service.upsertContact(ctx(), { ...freshInput(), name: "cambió" }), "CONFLICT");
    error(await service.claimDueFollowups(ctx(), { limit: 5, lease_seconds: 90 }), "CONFLICT");
    expect(service.snapshot()).toEqual(before);
  });
  it("el action_id se separa por empresa y rechaza otro actor como PLAT-02", async () => {
    const service = createMockCrm();
    const first = data(await service.upsertContact(ctx(), freshInput()));
    const otherCompany = data(await service.upsertContact(ctx("action-1", company2), freshInput()));
    expect(otherCompany.contact.id).not.toBe(first.contact.id);
    expect(otherCompany.contact.company_id).toBe(company2);
    error(await service.upsertContact({ ...ctx(), actor_id: "other" }, freshInput()), "CONFLICT");
    error(await service.upsertContact({ ...ctx(), actor_type: "system" }, freshInput()), "CONFLICT");
  });
  it("reimporta por dominio normalizado y nunca revierte do_not_contact", async () => {
    const service = createMockCrm();
    const existing = fixtures.contacts.find((contact) => contact.do_not_contact)!;
    const updated = data(await service.upsertContact(ctx(), { ...freshInput(), website: existing.website!.replace("https://", "https://www.") + "/contacto", do_not_contact: false }));
    expect(updated).toMatchObject({ created: false, contact: { id: existing.id, do_not_contact: true } });
  });
  it("rechaza coincidencias de teléfono y dominio en contactos diferentes", async () => {
    const service = createMockCrm();
    error(await service.upsertContact(ctx(), { ...freshInput(), phone_e164: fixtures.contacts[0].phone_e164, website: fixtures.contacts[1].website }), "CONFLICT");
    expect(service.snapshot().contacts).toHaveLength(fixtures.contacts.length);
  });
  it("valida payload estricto y action_id antes de mutar", async () => {
    const service = createMockCrm();
    error(await service.upsertContact(ctx(""), freshInput()), "VALIDATION_ERROR");
    error(await service.upsertContact(ctx(), { ...freshInput(), company_id: company2 } as UpsertContactInput), "VALIDATION_ERROR");
    expect(service.snapshot().contacts).toHaveLength(fixtures.contacts.length);
  });
});

describe("CRM mock: resultados y reglas de pipeline", () => {
  it.each([
    [{ do_not_contact_requested: true, technical_status: "failed" }, "disqualified", null],
    [{ technical_status: "failed", outcome: "not_interested" }, "contacted", null],
    [{ answered_by: "voicemail", outcome: "not_interested" }, "contacted", null],
    [{ answered_by: "unknown" }, "contacted", null],
    [{ outcome: "not_interested", is_potential_client: "no" }, "lost", null],
    [{ is_potential_client: "no", outcome: "callback_requested" }, "disqualified", null],
    [{ outcome: "callback_requested" }, "follow_up", "human_review"],
    [{ outcome: "callback_requested", next_action: { type: "callback", due_at: "2026-11-09T13:00:00Z", reason: "Callback ficticio" } }, "follow_up", "callback"],
    [{ outcome: "wants_to_buy" }, "potential_client", "human_review"],
    [{ outcome: "interested" }, "potential_client", null],
  ] as const)("aplica primera regla coincidente: %j", async (overrides, stage, taskKind) => {
    const service = createMockCrm();
    const result = data(await service.recordCallResult(ctx(), baseEvent(overrides)));
    expect(result.deal?.stage).toBe(stage);
    expect(result.tasks.map((task) => task.kind)).toEqual(taskKind ? [taskKind] : []);
    if (taskKind === "human_review") expect(result.tasks[0].due_at).toBeNull();
  });
  it.each(["won", "lost", "disqualified"] as const)("preserva etapa terminal %s, registra DNC y cancela callbacks", async (stage) => {
    const custom = seed();
    custom.deals[0].stage = stage;
    const service = createMockCrm({ seed: custom });
    const scheduled = data(await service.scheduleFollowup(ctx("schedule"), { contact_id: contactId, deal_id: dealId, kind: "callback", due_at: fixtures.now, reason: "Fixture" })).task;
    expect(data(await service.recordCallResult(ctx(), baseEvent({ do_not_contact_requested: true }))).deal?.stage).toBe(stage);
    expect(service.snapshot().contacts[0].do_not_contact).toBe(true);
    expect(service.snapshot().tasks.find((task) => task.id === scheduled.id)?.status).toBe("cancelled");
  });
  it("un fallo no degrada un cliente potencial", async () => {
    const custom = seed();
    custom.deals[0].stage = "potential_client";
    const service = createMockCrm({ seed: custom });
    expect(data(await service.recordCallResult(ctx(), baseEvent({ technical_status: "failed" }))).deal?.stage).toBe("potential_client");
  });
  it("repite eventos sin crear tareas y rechaza evento con contenido distinto", async () => {
    const service = createMockCrm();
    const event = baseEvent({ outcome: "wants_to_buy" });
    const first = data(await service.recordCallResult(ctx(), event));
    expect(data(await service.recordCallResult(ctx("new-action"), event))).toMatchObject({ ...first, duplicate: true });
    expect(data(await service.recordCallResult(ctx(), event))).toEqual(first);
    error(await service.recordCallResult(ctx("changed"), { ...event, summary: "Otro contenido" }), "CONFLICT");
    expect(service.snapshot().tasks.filter((task) => task.source_call_id === callId)).toHaveLength(1);
  });
  it("reconoce duplicados presentes en el seed", async () => {
    const service = createMockCrm();
    const event = service.snapshot().call_results[0];
    expect(data(await service.recordCallResult(ctx(), event)).duplicate).toBe(true);
  });
  it("un evento procesado sin deal_id sigue siendo duplicado si aparece otra oportunidad", async () => {
    const event = baseEvent({ deal_id: null, outcome: "wants_to_buy" });
    const service = createMockCrm();
    const first = data(await service.recordCallResult(ctx(), event));
    // A later deployment can reload a seed with additional opportunities.
    const changed = service.snapshot();
    changed.deals.push({ ...changed.deals[0], id: "90000000-0000-4000-8000-000000000099" });
    const reloaded = createMockCrm({ seed: changed });
    const duplicate = data(await reloaded.recordCallResult(ctx("repeat"), event));
    expect(duplicate.duplicate).toBe(true);
    expect(duplicate.deal).toBeNull(); // Unknown historic selection is not guessed.
    expect(duplicate.tasks).toEqual([]); // Tasks attached to another deal are not leaked.
    expect(reloaded.snapshot()).toEqual(changed);
    expect(first.deal?.id).toBe(dealId);
  });
  it("duplicado de seed solo devuelve tareas del mismo contacto y oportunidad", async () => {
    const custom = seed();
    const event = custom.call_results[0];
    const task = custom.tasks[0];
    custom.tasks.push({ ...task, id: "90000000-0000-4000-8000-000000000088", source_call_id: event.call_id, contact_id: custom.contacts[1].id, deal_id: custom.deals[1].id });
    const service = createMockCrm({ seed: custom });
    const duplicate = data(await service.recordCallResult(ctx(), event));
    expect(duplicate.tasks.every((candidate) => candidate.contact_id === event.contact_id && candidate.deal_id === event.deal_id)).toBe(true);
  });
  it("un evento viejo se conserva sin mover pipeline ni crear tareas", async () => {
    const service = createMockCrm();
    await service.recordCallResult(ctx(), baseEvent());
    const old = data(await service.recordCallResult(ctx("old"), baseEvent({ event_id: "mock:old", occurred_at: "2026-11-06T15:00:00Z", outcome: "not_interested" })));
    expect(old.deal?.stage).toBe("potential_client");
    expect(old.tasks).toEqual([]);
    expect(service.snapshot().call_results.some((event) => event.event_id === "mock:old")).toBe(true);
  });
  it("un DNC viejo conserva autoridad sobre futuras llamadas", async () => {
    const service = createMockCrm();
    await service.recordCallResult(ctx(), baseEvent());
    const old = data(await service.recordCallResult(ctx("old"), baseEvent({ event_id: "mock:old", occurred_at: "2026-11-06T15:00:00Z", do_not_contact_requested: true })));
    expect(old.deal?.stage).toBe("disqualified");
    expect(service.snapshot().contacts[0].do_not_contact).toBe(true);
  });
  it("rechaza empresa ajena, oportunidad ajena y oportunidad ambigua", async () => {
    const service = createMockCrm();
    error(await service.recordCallResult(ctx(), baseEvent({ company_id: company2 })), "FORBIDDEN");
    error(await service.recordCallResult(ctx("other-deal"), baseEvent({ deal_id: fixtures.deals[1].id })), "NOT_FOUND");
    const custom = seed();
    custom.deals.push({ ...custom.deals[0], id: "90000000-0000-4000-8000-000000000099" });
    const ambiguous = createMockCrm({ seed: custom });
    error(await ambiguous.recordCallResult(ctx(), baseEvent({ deal_id: null })), "CONFLICT");
    expect(ambiguous.snapshot()).toEqual(custom);
  });
  it("no duplica callback ya agendado durante la llamada cuando next_action es null", async () => {
    const service = createMockCrm();
    const task = data(await service.scheduleFollowup(ctx("schedule"), { contact_id: contactId, deal_id: dealId, source_call_id: callId, kind: "callback", due_at: "2026-11-09T13:00:00Z", reason: "Acordado durante la llamada" })).task;
    const result = data(await service.recordCallResult(ctx(), baseEvent({ outcome: "callback_requested", next_action: null })));
    expect(result.tasks).toEqual([task]);
    expect(service.snapshot().tasks.filter((candidate) => candidate.source_call_id === callId)).toHaveLength(1);
  });
});

describe("CRM mock: tareas, leases y aislamiento", () => {
  const callback = { contact_id: contactId, deal_id: dealId, source_call_id: callId, kind: "callback" as const, due_at: fixtures.now, reason: "Callback ficticio" };
  it("deduplica por llamada+tipo+fecha y valida fecha y contacto", async () => {
    const service = createMockCrm();
    const first = data(await service.scheduleFollowup(ctx(), callback));
    expect(data(await service.scheduleFollowup(ctx("second"), callback))).toEqual(first);
    expect(data(await service.scheduleFollowup(ctx("milliseconds"), { ...callback, due_at: new Date(callback.due_at).toISOString() }))).toEqual(first);
    error(await service.scheduleFollowup(ctx("invalid"), { ...callback, due_at: null }), "VALIDATION_ERROR");
    error(await service.scheduleFollowup(ctx("foreign", company2), callback), "NOT_FOUND");
    const dnc = service.snapshot().contacts.find((contact) => contact.do_not_contact)!;
    error(await service.scheduleFollowup(ctx("dnc"), { ...callback, contact_id: dnc.id, deal_id: undefined }), "FORBIDDEN");
  });
  it("dos reclamos simultáneos no toman la misma tarea; excluye revisión humana y DNC", async () => {
    const service = createMockCrm();
    await service.scheduleFollowup(ctx("schedule"), callback);
    await service.scheduleFollowup(ctx("review"), { ...callback, kind: "human_review", source_call_id: undefined, due_at: null });
    const claims = await Promise.all([service.claimDueFollowups(ctx("claim-1"), { limit: 5, lease_seconds: 90 }), service.claimDueFollowups(ctx("claim-2"), { limit: 5, lease_seconds: 90 })]);
    const tasks = claims.flatMap((result) => data(result).tasks);
    expect(tasks.length).toBeGreaterThan(0);
    expect(new Set(tasks.map((task) => task.id)).size).toBe(tasks.length);
    expect(tasks.every((task) => task.kind === "callback" && task.status === "running" && task.lease_id && task.lease_expires_at === "2026-11-07T15:01:30.000Z")).toBe(true);
    expect(tasks.every((task) => !service.snapshot().contacts.find((contact) => contact.id === task.contact_id)?.do_not_contact)).toBe(true);
    expect(data(await service.claimDueFollowups(ctx("claim-1"), { limit: 5, lease_seconds: 90 })).tasks).toEqual(data(claims[0]).tasks);
  });
  it("respeta máximo de lote y duración fijados por el brief", async () => {
    const service = createMockCrm();
    error(await service.claimDueFollowups(ctx(), { limit: 6, lease_seconds: 90 }), "VALIDATION_ERROR");
    error(await service.claimDueFollowups(ctx("short"), { limit: 5, lease_seconds: 30 }), "VALIDATION_ERROR");
  });
  it("un lease vencido o anterior no puede completar ni fallar tras un nuevo reclamo", async () => {
    let current = new Date(fixtures.now);
    const custom = seed(); custom.tasks = [];
    const service = createMockCrm({ seed: custom, now: () => current });
    await service.scheduleFollowup(ctx("schedule"), callback);
    const old = data(await service.claimDueFollowups(ctx("claim"), { limit: 1, lease_seconds: 90 })).tasks[0];
    current = new Date(current.getTime() + 90_000);
    error(await service.completeFollowup(ctx("expired"), { task_id: old.id, lease_id: old.lease_id!, call_id: callId }), "CONFLICT");
    const reclaimed = data(await service.claimDueFollowups(ctx("reclaim"), { limit: 1, lease_seconds: 90 })).tasks[0];
    expect(reclaimed.lease_id).not.toBe(old.lease_id);
    expect(reclaimed.attempts).toBe(2);
    error(await service.failFollowup(ctx("stale"), { task_id: old.id, lease_id: old.lease_id!, error_code: "MOCK_PROVIDER_ERROR" }), "CONFLICT");
    error(await service.completeFollowup(ctx("foreign", company2), { task_id: old.id, lease_id: reclaimed.lease_id!, call_id: callId }), "NOT_FOUND");
    const completed = data(await service.completeFollowup(ctx("complete"), { task_id: old.id, lease_id: reclaimed.lease_id!, call_id: callId })).task;
    expect(completed).toMatchObject({ status: "completed", call_id: callId, lease_id: null });
    expect(service.snapshot().deals[0].stage).toBe("new");
  });
  it("registra fallos explícitos y permite fecha futura de reintento", async () => {
    const custom = seed(); custom.tasks = [];
    const service = createMockCrm({ seed: custom });
    await service.scheduleFollowup(ctx("schedule"), callback);
    const task = data(await service.claimDueFollowups(ctx("claim"), { limit: 1, lease_seconds: 90 })).tasks[0];
    const input = { task_id: task.id, lease_id: task.lease_id!, error_code: "MOCK_PROVIDER_ERROR" };
    error(await service.failFollowup(ctx("past"), { ...input, retry_at: "2026-11-06T15:00:00Z" }), "VALIDATION_ERROR");
    const failed = data(await service.failFollowup(ctx("fail"), { ...input, retry_at: "2026-11-09T13:00:00Z" })).task;
    expect(failed).toMatchObject({ status: "pending", error_code: "MOCK_PROVIDER_ERROR", due_at: "2026-11-09T13:00:00Z", lease_id: null });
    expect(data(await service.claimDueFollowups(ctx("early"), { limit: 5, lease_seconds: 90 })).tasks).toEqual([]);
  });
});
