import type { CallDTO, CallResultV1 } from "@/contracts/voice";

// FIXTURES de Voz (TRA-43): datos ficticios para desarrollar y probar sin
// telefonía. No son resultados de llamadas reales. Los IDs son UUID fijos y no
// hay teléfonos: el CRM los resuelve desde sus propios contactos.
export const voiceFixtureIds = {
  company: "11111111-1111-4111-8111-111111111111",
  contact: "33333333-3333-4333-8333-333333333333",
  deal: "55555555-5555-4555-8555-555555555555",
  call: "66666666-6666-4666-8666-666666666666",
} as const;

export const callDtoFixture: CallDTO = {
  id: voiceFixtureIds.call,
  company_id: voiceFixtureIds.company,
  contact_id: voiceFixtureIds.contact,
  deal_id: voiceFixtureIds.deal,
  source_task_id: null,
  provider_call_id: null,
  transport: "mock",
  status: "queued",
  objective: "Presentar la empresa y detectar si hay interés",
  agent_version: null,
  created_at: "2026-11-07T15:00:00.000Z",
  updated_at: "2026-11-07T15:00:00.000Z",
};

const baseResult = {
  schema_version: "1",
  occurred_at: "2026-11-07T15:02:00.000Z",
  company_id: voiceFixtureIds.company,
  call_id: voiceFixtureIds.call,
  contact_id: voiceFixtureIds.contact,
  deal_id: voiceFixtureIds.deal,
  agent_version: 1,
  transcript_url: null,
} as const;

// Un ejemplo por cada caso que el CRM tiene que resolver (BRIEF §8).
export const callResultFixtures = {
  interested: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:interested",
    technical_status: "completed",
    answered_by: "human",
    is_potential_client: "yes",
    outcome: "interested",
    do_not_contact_requested: false,
    score: 82,
    summary: "Atendió el dueño. Le interesa recibir una propuesta y pidió los precios por mail.",
    next_action: null,
  },
  callbackRequested: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:callback",
    technical_status: "completed",
    answered_by: "human",
    is_potential_client: "yes",
    outcome: "callback_requested",
    do_not_contact_requested: false,
    score: 64,
    summary: "Está ocupado. Pidió que lo llamen el jueves a las 14 para hablar con calma.",
    next_action: {
      type: "callback",
      due_at: "2026-11-12T17:00:00.000Z",
      reason: "Pidió que lo llamen el jueves a las 14 (hora de Argentina)",
    },
  },
  wantsToBuy: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:wants-to-buy",
    technical_status: "completed",
    answered_by: "human",
    is_potential_client: "yes",
    outcome: "wants_to_buy",
    do_not_contact_requested: false,
    score: 95,
    summary: "Quiere contratar. Pidió que una persona del equipo lo contacte para cerrar.",
    next_action: { type: "human_review", due_at: null, reason: "Cerrar la venta con una persona" },
  },
  notInterested: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:not-interested",
    technical_status: "completed",
    answered_by: "human",
    is_potential_client: "no",
    outcome: "not_interested",
    do_not_contact_requested: false,
    score: 10,
    summary: "Ya trabaja con otro proveedor y no le interesa cambiar.",
    next_action: null,
  },
  doNotContact: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:do-not-contact",
    technical_status: "completed",
    answered_by: "human",
    is_potential_client: "no",
    outcome: "not_interested",
    do_not_contact_requested: true,
    score: 0,
    summary: "Pidió explícitamente que no lo vuelvan a llamar.",
    next_action: null,
  },
  voicemail: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:voicemail",
    technical_status: "completed",
    answered_by: "voicemail",
    is_potential_client: "unknown",
    outcome: "not_assessed",
    do_not_contact_requested: false,
    score: null,
    summary: "Atendió el contestador. No se dejó mensaje.",
    next_action: null,
  },
  technicalFailure: {
    ...baseResult,
    event_id: "fixture:end-of-call-report:failed",
    technical_status: "failed",
    answered_by: "unknown",
    is_potential_client: "unknown",
    outcome: "not_assessed",
    do_not_contact_requested: false,
    score: null,
    summary: "La llamada no se pudo conectar.",
    next_action: null,
  },
} as const satisfies Record<string, CallResultV1>;
