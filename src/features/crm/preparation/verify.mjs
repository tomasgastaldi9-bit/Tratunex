// Verificación local de preparación. Node 24 + Zod; no requiere app ni base.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import {
  CallResultV1Schema,
  CompleteFollowupInputSchema,
  ContactDTOSchema,
  DealDTOSchema,
  FailFollowupInputSchema,
  PIPELINE_STAGES,
  ScheduleFollowupInputSchema,
  TaskDTOSchema,
  UpsertContactInputSchema,
  crmOperationSchemas,
} from "../../../contracts/crm.ts";

const fixtures = JSON.parse(await readFile(new URL("../mocks/fixtures.json", import.meta.url), "utf8"));
const contact = fixtures.contacts[0];
const callback = fixtures.tasks.find((task) => task.kind === "callback");
const result = fixtures.call_results.find((entry) => entry.technical_status === "completed");
const upsert = {
  name: contact.name,
  organization: contact.organization,
  phone_e164: contact.phone_e164,
  website: contact.website,
  source: contact.source,
};

test("los fixtures tienen modo mock y todos sus DTO validan", () => {
  assert.equal(fixtures.mode, "mock");
  assert.equal(fixtures.now, "2026-11-07T15:00:00Z");
  assert.equal(fixtures.companies.length, 2);
  for (const entry of fixtures.contacts) ContactDTOSchema.parse(entry);
  for (const entry of fixtures.deals) DealDTOSchema.parse(entry);
  for (const entry of fixtures.tasks) TaskDTOSchema.parse(entry);
  for (const entry of fixtures.call_results) CallResultV1Schema.parse(entry);
});

test("el bridge del boceto contiene exactamente el JSON canónico", async () => {
  const source = await readFile(new URL("../mocks/fixtures.js", import.meta.url), "utf8");
  const sandbox = vm.createContext({});
  vm.runInContext(source, sandbox, { timeout: 1000 });
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.CRM_MOCK_FIXTURES)), fixtures);
});

test("IDs, relaciones y empresas son consistentes, incluso con múltiples oportunidades", () => {
  const companies = new Set(fixtures.companies.map((company) => company.id));
  const contacts = new Map(fixtures.contacts.map((entry) => [entry.id, entry]));
  const deals = new Map(fixtures.deals.map((entry) => [entry.id, entry]));
  const calls = new Map(fixtures.call_previews.map((entry) => [entry.id, entry]));
  for (const collection of [fixtures.companies, fixtures.contacts, fixtures.deals, fixtures.tasks, fixtures.activities, fixtures.call_previews]) {
    assert.equal(new Set(collection.map((entry) => entry.id)).size, collection.length, "ID duplicado");
  }
  assert.equal(new Set(fixtures.call_results.map((entry) => entry.event_id)).size, fixtures.call_results.length);
  for (const entry of fixtures.contacts) assert.ok(companies.has(entry.company_id));
  for (const entry of [...fixtures.deals, ...fixtures.tasks, ...fixtures.call_results, ...fixtures.activities, ...fixtures.call_previews]) {
    assert.ok(companies.has(entry.company_id));
    const ownerContact = contacts.get(entry.contact_id);
    assert.ok(ownerContact, "Contacto inexistente");
    assert.equal(ownerContact.company_id, entry.company_id, "Cruce de empresas");
    if (entry.deal_id != null) {
      const ownerDeal = deals.get(entry.deal_id);
      assert.ok(ownerDeal, "Oportunidad inexistente");
      assert.equal(ownerDeal.company_id, entry.company_id);
      assert.equal(ownerDeal.contact_id, entry.contact_id);
    }
    for (const key of ["source_call_id", "call_id"]) {
      if (entry[key] != null) {
        const ownerCall = calls.get(entry[key]);
        assert.ok(ownerCall, "Llamada inexistente");
        assert.equal(ownerCall.company_id, entry.company_id);
        assert.equal(ownerCall.contact_id, entry.contact_id);
      }
    }
  }
  assert.ok(fixtures.contacts.some((entry) => fixtures.deals.filter((deal) => deal.contact_id === entry.id).length > 1));
});

test("el reloj fijo y la cronología de los ejemplos son coherentes", () => {
  const now = Date.parse(fixtures.now);
  for (const entry of [...fixtures.contacts, ...fixtures.deals, ...fixtures.tasks]) {
    assert.ok(Date.parse(entry.created_at) <= Date.parse(entry.updated_at));
    assert.ok(Date.parse(entry.updated_at) <= now);
  }
  for (const entry of [...fixtures.call_results, ...fixtures.activities]) {
    assert.ok(Number.isFinite(Date.parse(entry.occurred_at)));
    assert.ok(Date.parse(entry.occurred_at) <= now);
  }
  for (const entry of fixtures.call_previews) {
    assert.equal(entry.mode, "mock");
    assert.ok(["completed", "failed", "unknown"].includes(entry.status));
    assert.ok(Date.parse(entry.started_at) <= now);
  }
  for (const task of fixtures.tasks.filter((entry) => entry.status === "running")) {
    assert.ok(Date.parse(task.lease_expires_at) > now);
  }
});

test("el dataset cubre siete etapas, cinco estados de tarea y resultados ambiguos", () => {
  assert.deepEqual(new Set(fixtures.deals.map((entry) => entry.stage)), new Set(PIPELINE_STAGES.map((entry) => entry.code)));
  assert.deepEqual(new Set(fixtures.tasks.map((entry) => entry.status)), new Set(["pending", "running", "completed", "failed", "cancelled"]));
  assert.ok(fixtures.tasks.some((entry) => entry.kind === "human_review" && entry.due_at === null));
  assert.ok(fixtures.contacts.some((entry) => entry.do_not_contact));
  for (const entry of fixtures.contacts) {
    assert.ok(fixtures.call_previews.filter((call) => call.contact_id === entry.id).length <= 2);
    if (entry.do_not_contact) {
      assert.ok(!fixtures.tasks.some((task) => task.contact_id === entry.id && ["pending", "running"].includes(task.status)));
    }
  }
  assert.ok(fixtures.call_results.some((entry) => entry.answered_by === "voicemail"));
  assert.ok(fixtures.call_results.some((entry) => entry.technical_status === "failed"));
  const unknownCalls = fixtures.call_previews.filter((entry) => entry.status === "unknown");
  assert.ok(unknownCalls.length > 0);
  for (const entry of unknownCalls) assert.ok(!fixtures.call_results.some((final) => final.call_id === entry.id));
});

test("solo se usan números ficticios reservados y dominios .example", () => {
  for (const entry of fixtures.contacts) assert.match(entry.phone_e164, /^\+120255501\d{2}$/);
  const urls = [
    ...fixtures.contacts.flatMap((entry) => [entry.website, entry.source.url]),
    ...fixtures.call_results.map((entry) => entry.transcript_url),
  ].filter(Boolean);
  for (const url of urls) assert.ok(new URL(url).hostname.endsWith(".example"));
  assert.ok(!JSON.stringify(fixtures).includes("\uFFFD"), "El dataset no debe tener caracteres de reemplazo");
});

test("los inputs rechazan identidad inyectada y metadatos administrados por servidor", () => {
  assert.ok(UpsertContactInputSchema.safeParse(upsert).success);
  for (const forbidden of ["company_id", "actor_id", "action_id", "id", "created_at"]) {
    assert.equal(UpsertContactInputSchema.safeParse({ ...upsert, [forbidden]: contact.id }).success, false);
  }
  assert.equal(UpsertContactInputSchema.safeParse({ ...upsert, phone_e164: "202 555 0100" }).success, false);
});

test("callback exige fecha UTC y revisión humana acepta fecha desconocida", () => {
  const input = { contact_id: contact.id, kind: "callback", due_at: callback.due_at, reason: "Ejemplo ficticio" };
  assert.ok(ScheduleFollowupInputSchema.safeParse(input).success);
  for (const due_at of [null, "jueves", "2026-11-08T12:00:00-03:00", "2026-11-08T12:00:00"]) {
    assert.equal(ScheduleFollowupInputSchema.safeParse({ ...input, due_at }).success, false);
  }
  assert.ok(ScheduleFollowupInputSchema.safeParse({ ...input, kind: "human_review", due_at: null }).success);
  assert.equal(TaskDTOSchema.safeParse({ ...callback, due_at: null }).success, false);
});

test("una tarea running requiere lease y los workers deben enviar su lease_id", () => {
  assert.equal(TaskDTOSchema.safeParse({ ...callback, status: "running", lease_id: null, lease_expires_at: null }).success, false);
  assert.equal(CompleteFollowupInputSchema.safeParse({ task_id: callback.id, call_id: result.call_id }).success, false);
  assert.equal(FailFollowupInputSchema.safeParse({ task_id: callback.id, error_code: "PROVIDER_UNAVAILABLE" }).success, false);
});

test("el contrato final conserva unknown comercial y rechaza unknown técnico y scores fuera de rango", () => {
  assert.ok(CallResultV1Schema.safeParse({ ...result, event_id: "vapi:fixture:external-id", is_potential_client: "unknown", score: 72.5 }).success);
  assert.equal(CallResultV1Schema.safeParse({ ...result, event_id: " vapi:fixture:external-id " }).success, false);
  assert.equal(CallResultV1Schema.safeParse({ ...result, technical_status: "unknown" }).success, false);
  for (const score of [-1, 101]) assert.equal(CallResultV1Schema.safeParse({ ...result, score }).success, false);
  assert.equal(CallResultV1Schema.safeParse({ ...result, next_action: { type: "callback", due_at: null, reason: "Sin fecha" } }).success, false);
});

test("se conservan las siete operaciones y las formas de data del brief", () => {
  assert.deepEqual(Object.keys(crmOperationSchemas), ["upsertContact", "getContact", "recordCallResult", "scheduleFollowup", "claimDueFollowups", "completeFollowup", "failFollowup"]);
  crmOperationSchemas.upsertContact.data.parse({ contact, created: true });
  crmOperationSchemas.getContact.data.parse({ contact });
  crmOperationSchemas.recordCallResult.data.parse({ event_id: result.event_id, duplicate: false, deal: null, tasks: [] });
  crmOperationSchemas.claimDueFollowups.data.parse({ tasks: [callback] });
  for (const operation of ["scheduleFollowup", "completeFollowup", "failFollowup"]) {
    crmOperationSchemas[operation].data.parse({ task: callback });
  }
});
