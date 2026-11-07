import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../../contracts/common";
import { DealDTOSchema, type CreateDealInput, type SetDealStageInput } from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import { createPipelineCrm } from "./pipeline-service";

const ctx: ActionCtx = {
  company_id: fixtures.companies[0].id,
  actor_type: "user",
  actor_id: "90000000-0000-4000-8000-000000000001",
  action_id: "pipeline-stable-action",
};
const deal = DealDTOSchema.parse(fixtures.deals[0]);
const createInput: CreateDealInput = { contact_id: deal.contact_id, title: "Oportunidad de prueba ficticia" };

describe("CRM-04: frontera del servicio de pipeline", () => {
  it("conserva action_id y expected_stage en reintentos de la misma mutación", async () => {
    const input: SetDealStageInput = { deal_id: deal.id, stage: "won", expected_stage: "potential_client" };
    const execute = vi.fn(async () => ({ data: { ok: true, data: { deal: { ...deal, stage: "won" } } }, error: null }));
    const crm = createPipelineCrm(execute);
    const first = await crm.setDealStage(ctx, input);
    expect(first).toMatchObject({ ok: true, data: { deal: { id: deal.id, stage: "won" } } });
    expect(await crm.setDealStage(ctx, input)).toEqual(first);
    expect(execute).toHaveBeenNthCalledWith(1, ctx, "setDealStage", input);
    expect(execute).toHaveBeenNthCalledWith(2, ctx, "setDealStage", input);
  });

  it("envía la creación explícita y normaliza fechas sin alterar IDs", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { deal: {
      ...deal, title: createInput.title, created_at: "2026-11-07T09:00:00-03:00", updated_at: "2026-11-07T12:00:00+00:00",
    } } }, error: null }));
    const result = await createPipelineCrm(execute).createDeal(ctx, createInput);
    expect(result).toMatchObject({ ok: true, data: { deal: {
      id: deal.id, company_id: ctx.company_id, contact_id: deal.contact_id,
      created_at: "2026-11-07T12:00:00.000Z", updated_at: "2026-11-07T12:00:00.000Z",
    } } });
    expect(execute).toHaveBeenCalledWith(ctx, "createDeal", createInput);
  });

  it("rechaza actor, empresa e intención inválidos antes del executor", async () => {
    const execute = vi.fn();
    const crm = createPipelineCrm(execute);
    for (const changed of [
      { ...ctx, actor_type: "model" }, { ...ctx, actor_id: "model-decided" },
      { ...ctx, company_id: "foreign-company" }, { ...ctx, action_id: "" },
    ]) {
      expect(await crm.createDeal(changed as ActionCtx, createInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("rechaza etapas e inyección de autoridad antes de tocar la base", async () => {
    const execute = vi.fn();
    const crm = createPipelineCrm(execute);
    expect(await crm.createDeal(ctx, { ...createInput, company_id: fixtures.companies[1].id } as CreateDealInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.createDeal(ctx, { ...createInput, contact_id: "invalid" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.setDealStage(ctx, { deal_id: deal.id, stage: "sale" } as unknown as SetDealStageInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.setDealStage(ctx, { deal_id: deal.id, stage: "won", expected_stage: "invalid" } as unknown as SetDealStageInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("no sustituye por mocks una RPC ausente", async () => {
    const execute = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find public.pipeline_execute" } }));
    const crm = createPipelineCrm(execute);
    expect(await crm.createDeal(ctx, createInput)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(await crm.listDeals(ctx, { limit: 50 })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rechaza un deal de otra empresa aunque su forma sea válida", async () => {
    const foreign = { ...deal, company_id: fixtures.companies[1].id, title: "Dato de otra empresa" };
    const execute = vi.fn(async () => ({ data: { ok: true, data: { deal: foreign } }, error: null }));
    const result = await createPipelineCrm(execute).createDeal(ctx, createInput);
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain(foreign.title);
  });

  it("rechaza datos extranjeros anidados en una página de deals", async () => {
    const foreign = { ...deal, company_id: fixtures.companies[1].id, title: "Deal extranjero" };
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [deal, foreign], next_cursor: null } }, error: null }));
    const result = await createPipelineCrm(execute).listDeals(ctx, { limit: 50 });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain(foreign.title);
  });

  it("rechaza actividades extranjeras y preserva el aislamiento de las listas", async () => {
    const activity = {
      id: "80000000-0000-4000-8000-000000000001", company_id: fixtures.companies[1].id,
      contact_id: deal.contact_id, deal_id: deal.id, kind: "deal_stage_changed",
      occurred_at: "2026-11-07T12:00:00Z", summary: "Actividad extranjera",
      actor_type: "user", actor_id: ctx.actor_id,
    };
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [activity], next_cursor: null } }, error: null }));
    const result = await createPipelineCrm(execute).listActivities(ctx, { limit: 50 });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain(activity.summary);
  });

  it("pasa filtros de lectura y elimina action_id del contexto sin mutación", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [], next_cursor: null } }, error: null }));
    const crm = createPipelineCrm(execute);
    const readContext = { company_id: ctx.company_id, actor_type: ctx.actor_type, actor_id: ctx.actor_id };
    const input = { limit: 50, contact_id: deal.contact_id, stage: "new" as const };
    expect(await crm.listDeals(ctx, input)).toEqual({ ok: true, data: { items: [], next_cursor: null } });
    expect(execute).toHaveBeenCalledWith(readContext, "listDeals", input);
    expect(await crm.listActivities(ctx, { limit: 50, contact_id: deal.contact_id })).toEqual({ ok: true, data: { items: [], next_cursor: null } });
    expect(execute).toHaveBeenCalledWith(readContext, "listActivities", { limit: 50, contact_id: deal.contact_id });
  });

  it("conserva CONFLICT y no convierte una respuesta incompleta en éxito", async () => {
    const conflict = { ok: false, error: { code: "CONFLICT", message: "La etapa cambió", retryable: false } };
    const execute = vi.fn(async () => ({ data: conflict, error: null }));
    expect(await createPipelineCrm(execute).setDealStage(ctx, { deal_id: deal.id, stage: "won" })).toEqual(conflict);
    const incomplete = vi.fn(async () => ({ data: { ok: true, data: { deal: { id: deal.id } } }, error: null }));
    expect(await createPipelineCrm(incomplete).createDeal(ctx, createInput)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });

  it("mantiene ambiguo un fallo de red y no reintenta automáticamente", async () => {
    const execute = vi.fn(async () => { throw new Error("Connection lost after write"); });
    expect(await createPipelineCrm(execute).setDealStage(ctx, { deal_id: deal.id, stage: "won" })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
