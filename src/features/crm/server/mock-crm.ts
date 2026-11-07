import { randomUUID } from "node:crypto";
import { z } from "zod";
import { actionCtxSchema, ctxSchema, type ActionCtx, type Ctx, type ErrorCode, type Result } from "../../../contracts/common";
import {
  CallResultV1Schema, ClaimDueFollowupsInputSchema, CompleteFollowupInputSchema,
  ContactDTOSchema, DealDTOSchema, FailFollowupInputSchema, GetContactInputSchema,
  ScheduleFollowupInputSchema, TaskDTOSchema, UpsertContactInputSchema,
  type CallResultV1, type ClaimDueFollowupsData, type ClaimDueFollowupsInput,
  type CompleteFollowupInput, type ContactDTO, type DealDTO, type FailFollowupInput,
  type FollowupData, type GetContactData, type GetContactInput, type PipelineStage,
  type RecordCallResultData, type ScheduleFollowupInput, type TaskDTO,
  type UpsertContactData, type UpsertContactInput,
} from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";

export const CRM_MOCK_INTEGRATION = {
  mode: "mock", persistence: "process", clock: fixtures.now,
  description: "Simulación con datos ficticios; se reinicia al reiniciar el proceso. Sin base, auth ni llamadas reales.",
} as const;

export type MockCrmSeed = {
  contacts: ContactDTO[];
  deals: DealDTO[];
  tasks: TaskDTO[];
  call_results: CallResultV1[];
};

function defaultSeed(): MockCrmSeed {
  return {
    contacts: z.array(ContactDTOSchema).parse(fixtures.contacts),
    deals: z.array(DealDTOSchema).parse(fixtures.deals),
    tasks: z.array(TaskDTOSchema).parse(fixtures.tasks),
    call_results: z.array(CallResultV1Schema).parse(fixtures.call_results),
  };
}

function ok<T>(data: T): Result<T> { return { ok: true, data }; }
function fail<T>(code: ErrorCode, message: string): Result<T> {
  return { ok: false, error: { code, message, retryable: false } };
}

// Stable object ordering avoids treating reordered JSON keys as a different action.
function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;
    return `{${Object.keys(object).sort().map((key) => `${JSON.stringify(key)}:${canonical(object[key])}`).join(",")}}`;
  }
  return JSON.stringify(value) ?? "undefined";
}

function domain(website: string | null): string | null {
  return website ? new URL(website).hostname.toLowerCase().replace(/^www\./, "") : null;
}

const terminal = new Set<PipelineStage>(["won", "lost", "disqualified"]);

/** Testable process-local simulator. It makes no durability or database atomicity guarantee. */
export function createMockCrm(options: { seed?: MockCrmSeed; now?: () => Date } = {}) {
  let state = structuredClone(options.seed ?? defaultSeed());
  const clock = options.now ?? (() => new Date(fixtures.now));
  const receipts = new Map<string, { signature: string; result: Result<unknown> }>();
  const eventReceipts = new Map<string, { signature: string; data: RecordCallResultData }>();
  const companyIds: Set<string> = new Set(fixtures.companies.map((company) => company.id));

  function validateCtx(ctx: Ctx): Result<Ctx> {
    const parsed = ctxSchema.safeParse(ctx);
    if (!parsed.success) return fail("VALIDATION_ERROR", "Contexto de servidor inválido.");
    if (!companyIds.has(ctx.company_id)) return fail("FORBIDDEN", "El simulador solo admite las empresas ficticias publicadas.");
    return ok(parsed.data);
  }

  // Work is synchronous, so concurrent callers within this process cannot interleave mutations.
  function mutate<I, O>(ctx: ActionCtx, input: I, schema: z.ZodType<I>, operation: string,
    work: (data: I) => Result<O>): Promise<Result<O>> {
    const valid = validateCtx(ctx);
    if (!valid.ok) return Promise.resolve(valid);
    if (!actionCtxSchema.safeParse(ctx).success) return Promise.resolve(fail("VALIDATION_ERROR", "Falta un action_id estable."));
    const parsed = schema.safeParse(input);
    if (!parsed.success) return Promise.resolve(fail("VALIDATION_ERROR", parsed.error.issues.map((issue) => issue.message).join("; ")));
    // Matches PLAT-02's (company_id, action_id) receipt key; actor mismatch conflicts.
    const key = canonical([ctx.company_id, ctx.action_id]);
    const signature = canonical({ actor_type: ctx.actor_type, actor_id: ctx.actor_id, operation, input: parsed.data });
    const previous = receipts.get(key);
    if (previous) {
      return Promise.resolve(previous.signature === signature
        ? structuredClone(previous.result) as Result<O>
          : fail("CONFLICT", "El action_id ya se usó con otro actor, operación o datos."));
    }
    const before = structuredClone(state);
    const result = work(parsed.data);
    if (!result.ok) state = before;
    receipts.set(key, { signature, result: structuredClone(result) });
    return Promise.resolve(structuredClone(result));
  }

  function contactFor(ctx: Ctx, id: string) {
    return state.contacts.find((contact) => contact.id === id && contact.company_id === ctx.company_id);
  }

  function schedule(ctx: Ctx, input: ScheduleFollowupInput): Result<FollowupData> {
    const contact = contactFor(ctx, input.contact_id);
    if (!contact) return fail("NOT_FOUND", "Contacto no disponible en esta empresa.");
    if (input.kind === "callback" && contact.do_not_contact) return fail("FORBIDDEN", "El contacto pidió no recibir llamadas.");
    if (input.deal_id && !state.deals.some((deal) => deal.id === input.deal_id && deal.contact_id === contact.id && deal.company_id === ctx.company_id)) {
      return fail("NOT_FOUND", "La oportunidad no pertenece al contacto y empresa.");
    }
    const duplicate = input.source_call_id && state.tasks.find((task) =>
      task.company_id === ctx.company_id && task.contact_id === contact.id &&
      task.source_call_id === input.source_call_id && task.kind === input.kind &&
      (task.due_at === input.due_at || (task.due_at !== null && input.due_at !== null && Date.parse(task.due_at) === Date.parse(input.due_at))));
    if (duplicate) {
      if (duplicate.deal_id !== (input.deal_id ?? null)) return fail("CONFLICT", "El seguimiento de esta llamada ya pertenece a otra oportunidad.");
      return ok({ task: duplicate });
    }
    const now = clock().toISOString();
    const task: TaskDTO = {
      id: randomUUID(), company_id: ctx.company_id, contact_id: contact.id,
      deal_id: input.deal_id ?? null, source_call_id: input.source_call_id ?? null,
      kind: input.kind, status: "pending", due_at: input.due_at, reason: input.reason,
      attempts: 0, lease_id: null, lease_expires_at: null, call_id: null, error_code: null,
      created_at: now, updated_at: now,
    };
    state.tasks.push(task);
    return ok({ task });
  }

  function getLease(ctx: Ctx, input: { task_id: string; lease_id: string }): Result<TaskDTO> {
    const task = state.tasks.find((candidate) => candidate.id === input.task_id && candidate.company_id === ctx.company_id);
    if (!task) return fail("NOT_FOUND", "Tarea no disponible en esta empresa.");
    if (task.status !== "running" || task.lease_id !== input.lease_id || !task.lease_expires_at || Date.parse(task.lease_expires_at) <= clock().getTime()) {
      return fail("CONFLICT", "El lease es anterior, venció o la tarea ya no está en ejecución.");
    }
    return ok(task);
  }

  return {
    integration: CRM_MOCK_INTEGRATION,
    snapshot: () => structuredClone(state),
    async getContact(ctx: Ctx, input: GetContactInput): Promise<Result<GetContactData>> {
      const valid = validateCtx(ctx);
      if (!valid.ok) return valid;
      const parsed = GetContactInputSchema.safeParse(input);
      if (!parsed.success) return fail("VALIDATION_ERROR", "Identificador de contacto inválido.");
      const contact = contactFor(ctx, parsed.data.contact_id);
      return contact ? ok({ contact: structuredClone(contact) }) : fail("NOT_FOUND", "Contacto no disponible en esta empresa.");
    },
    upsertContact(ctx: ActionCtx, input: UpsertContactInput): Promise<Result<UpsertContactData>> {
      return mutate(ctx, input, UpsertContactInputSchema, "upsertContact", (data) => {
        const matches = state.contacts.filter((contact) => contact.company_id === ctx.company_id &&
          (contact.phone_e164 === data.phone_e164 || (domain(data.website) !== null && domain(contact.website) === domain(data.website))));
        if (matches.length > 1) return fail("CONFLICT", "Teléfono y dominio identifican contactos distintos; requiere revisión.");
        const now = clock().toISOString();
        if (matches[0]) {
          Object.assign(matches[0], data, { do_not_contact: matches[0].do_not_contact || data.do_not_contact === true, updated_at: now });
          return ok({ contact: matches[0], created: false });
        }
        const contact: ContactDTO = { ...data, id: randomUUID(), company_id: ctx.company_id,
          do_not_contact: data.do_not_contact ?? false, created_at: now, updated_at: now };
        state.contacts.push(contact);
        state.deals.push({ id: randomUUID(), company_id: ctx.company_id, contact_id: contact.id,
          title: contact.organization ?? contact.name, stage: "new", created_at: now, updated_at: now });
        return ok({ contact, created: true });
      });
    },
    scheduleFollowup(ctx: ActionCtx, input: ScheduleFollowupInput): Promise<Result<FollowupData>> {
      return mutate(ctx, input, ScheduleFollowupInputSchema, "scheduleFollowup", (data) => schedule(ctx, data));
    },
    recordCallResult(ctx: ActionCtx, input: CallResultV1): Promise<Result<RecordCallResultData>> {
      return mutate(ctx, input, CallResultV1Schema, "recordCallResult", (data) => {
        if (data.company_id !== ctx.company_id) return fail("FORBIDDEN", "La empresa del evento difiere del contexto confiable.");
        const contact = contactFor(ctx, data.contact_id);
        if (!contact) return fail("NOT_FOUND", "Contacto no disponible en esta empresa.");
        const eventKey = canonical([ctx.company_id, data.event_id]);
        const signature = canonical(data);
        const prior = eventReceipts.get(eventKey);
        if (prior) return prior.signature === signature ? ok({ ...prior.data, duplicate: true }) : fail("CONFLICT", "El event_id ya se recibió con datos distintos.");
        const seeded = state.call_results.find((event) => event.company_id === ctx.company_id && event.event_id === data.event_id);
        if (seeded) {
          if (canonical(seeded) !== signature) return fail("CONFLICT", "El event_id ya se recibió con datos distintos.");
          const originalDeal = state.deals.find((candidate) => candidate.id === seeded.deal_id && candidate.contact_id === contact.id && candidate.company_id === ctx.company_id);
          return ok({ event_id: data.event_id, duplicate: true, deal: originalDeal ?? null,
            tasks: state.tasks.filter((task) => task.company_id === ctx.company_id && task.contact_id === contact.id &&
              task.deal_id === seeded.deal_id && task.source_call_id === data.call_id) });
        }
        const candidates = state.deals.filter((deal) => deal.company_id === ctx.company_id && deal.contact_id === contact.id);
        if (!data.deal_id && candidates.length > 1) return fail("CONFLICT", "Hay varias oportunidades: Voz debe especificar deal_id.");
        const deal = data.deal_id ? candidates.find((candidate) => candidate.id === data.deal_id) : candidates[0];
        if (data.deal_id && !deal) return fail("NOT_FOUND", "La oportunidad no pertenece al contacto y empresa.");
        const latest = state.call_results.filter((event) => event.company_id === ctx.company_id &&
          event.contact_id === contact.id && event.deal_id === (deal?.id ?? null))
          .reduce((time, event) => Math.max(time, Date.parse(event.occurred_at)), -Infinity);
        const stale = Date.parse(data.occurred_at) < latest;
        const tasks: TaskDTO[] = [];
        if (data.do_not_contact_requested) {
          contact.do_not_contact = true;
          contact.updated_at = clock().toISOString();
          for (const task of state.tasks) {
            if (task.company_id === ctx.company_id && task.contact_id === contact.id && task.kind === "callback" && ["pending", "running"].includes(task.status)) {
              Object.assign(task, { status: "cancelled", lease_id: null, lease_expires_at: null, updated_at: clock().toISOString() });
            }
          }
        }
        if (deal && !terminal.has(deal.stage) && (!stale || data.do_not_contact_requested)) {
          let stage = deal.stage;
          let next: CallResultV1["next_action"] = null;
          if (data.do_not_contact_requested || contact.do_not_contact) stage = "disqualified";
          else if (data.technical_status === "failed" || data.answered_by !== "human") {
            if (deal.stage === "new") stage = "contacted";
          } else if (data.outcome === "not_interested") stage = "lost";
          else if (data.is_potential_client === "no") stage = "disqualified";
          else if (data.outcome === "callback_requested") {
            stage = "follow_up";
            const existingCallback = data.next_action === null && state.tasks.find((task) =>
              task.company_id === ctx.company_id && task.contact_id === contact.id &&
              task.source_call_id === data.call_id && task.kind === "callback");
            if (existingCallback) tasks.push(existingCallback);
            next = existingCallback ? null : data.next_action?.type === "callback" ? data.next_action : {
              type: "human_review", due_at: null, reason: data.next_action?.reason ?? "Confirmar fecha del callback con una persona.",
            };
          } else if (data.outcome === "wants_to_buy") {
            stage = "potential_client";
            next = { type: "human_review", due_at: null, reason: "Revisar la intención de compra y confirmar cierre manualmente." };
          } else if (data.outcome === "interested" || data.is_potential_client === "yes") {
            stage = "potential_client";
            next = data.next_action;
          }
          if (next) {
            const scheduled = schedule(ctx, { contact_id: contact.id, deal_id: deal.id, source_call_id: data.call_id,
              kind: next.type, due_at: next.due_at, reason: next.reason });
            if (!scheduled.ok) return scheduled;
            tasks.push(scheduled.data.task);
          }
          deal.stage = stage;
          deal.updated_at = clock().toISOString();
        }
        state.call_results.push(data);
        const result: RecordCallResultData = { event_id: data.event_id, duplicate: false, deal: deal ?? null, tasks };
        eventReceipts.set(eventKey, { signature, data: structuredClone(result) });
        return ok(result);
      });
    },
    claimDueFollowups(ctx: ActionCtx, input: ClaimDueFollowupsInput): Promise<Result<ClaimDueFollowupsData>> {
      return mutate(ctx, input, ClaimDueFollowupsInputSchema, "claimDueFollowups", (data) => {
        if (data.limit > 5 || data.lease_seconds !== 90) return fail("VALIDATION_ERROR", "El MVP admite lotes de hasta 5 y lease de 90 segundos.");
        const now = clock();
        const tasks = state.tasks.filter((task) => task.company_id === ctx.company_id && task.kind === "callback" &&
          task.due_at !== null && Date.parse(task.due_at) <= now.getTime() && contactFor(ctx, task.contact_id)?.do_not_contact === false &&
          (task.status === "pending" || (task.status === "running" && task.lease_expires_at !== null && Date.parse(task.lease_expires_at) <= now.getTime())))
          .sort((a, b) => a.due_at!.localeCompare(b.due_at!) || a.id.localeCompare(b.id)).slice(0, data.limit);
        for (const task of tasks) Object.assign(task, { status: "running", lease_id: randomUUID(),
          lease_expires_at: new Date(now.getTime() + 90_000).toISOString(), attempts: task.attempts + 1, updated_at: now.toISOString() });
        return ok({ tasks });
      });
    },
    completeFollowup(ctx: ActionCtx, input: CompleteFollowupInput): Promise<Result<FollowupData>> {
      return mutate(ctx, input, CompleteFollowupInputSchema, "completeFollowup", (data) => {
        const found = getLease(ctx, data);
        if (!found.ok) return found;
        Object.assign(found.data, { status: "completed", call_id: data.call_id, lease_id: null, lease_expires_at: null,
          error_code: null, updated_at: clock().toISOString() });
        return ok({ task: found.data });
      });
    },
    failFollowup(ctx: ActionCtx, input: FailFollowupInput): Promise<Result<FollowupData>> {
      return mutate(ctx, input, FailFollowupInputSchema, "failFollowup", (data) => {
        const found = getLease(ctx, data);
        if (!found.ok) return found;
        if (data.retry_at && Date.parse(data.retry_at) <= clock().getTime()) return fail("VALIDATION_ERROR", "El reintento debe programarse en el futuro.");
        Object.assign(found.data, { status: data.retry_at ? "pending" : "failed", due_at: data.retry_at ?? found.data.due_at,
          lease_id: null, lease_expires_at: null, error_code: data.error_code, updated_at: clock().toISOString() });
        return ok({ task: found.data });
      });
    },
  };
}
