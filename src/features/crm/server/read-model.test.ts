import { describe, expect, it } from "vitest";
import type { ActionCtx } from "../../../contracts/common";
import type { CallResultV1 } from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import { createMockCrm } from "./mock-crm";
import { buildCrmDemo } from "./read-model";

const company = fixtures.companies[0].id;
const ctx: ActionCtx = { company_id: company, actor_type: "voice", actor_id: "mock-voice", action_id: "read-model-event" };
function event(overrides: Partial<CallResultV1> = {}): CallResultV1 {
  return {
    schema_version: "1", event_id: "mock:read-model-new-result", occurred_at: "2026-11-07T15:00:00Z",
    company_id: company, call_id: "90000000-0000-4000-8000-000000000077",
    contact_id: fixtures.contacts[0].id, deal_id: fixtures.deals[0].id,
    agent_version: 1, technical_status: "completed", answered_by: "human",
    is_potential_client: "yes", outcome: "interested", do_not_contact_requested: false,
    score: 81, summary: "Conversación ficticia nueva, visible en el historial.",
    transcript_url: null, next_action: null, ...overrides,
  };
}

describe("CRM demo read model", () => {
  it("recordCallResult actualiza resultado, pipeline, historial y actividad desde el mismo snapshot", async () => {
    const service = createMockCrm();
    const before = buildCrmDemo(service.snapshot());
    const result = event();
    expect((await service.recordCallResult(ctx, result)).ok).toBe(true);
    const after = buildCrmDemo(service.snapshot());
    expect(after.call_results.find((item) => item.event_id === result.event_id)).toEqual(result);
    expect(after.deals.find((item) => item.id === result.deal_id)?.stage).toBe("potential_client");
    expect(after.call_previews.find((item) => item.id === result.call_id)).toMatchObject({
      contact_id: result.contact_id, status: "completed", started_at: result.occurred_at, summary: result.summary,
    });
    const activity = after.activities.find((item) => item.summary.includes(result.summary));
    expect(activity).toMatchObject({ company_id: company, contact_id: result.contact_id, deal_id: result.deal_id,
      kind: "call_result_recorded", occurred_at: result.occurred_at });
    expect(activity?.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(after.activities).toHaveLength(before.activities.length + 1);
    await service.recordCallResult({ ...ctx, action_id: "read-model-repeat" }, result);
    expect(buildCrmDemo(service.snapshot()).activities).toEqual(after.activities);
    expect(after.call_previews).toHaveLength(before.call_previews.length + 1);
  });

  it("un resultado final resuelve unknown conservando started_at; unknown sin resultado continúa visible", async () => {
    const service = createMockCrm();
    const unknown = fixtures.call_previews.find((item) => item.status === "unknown")!;
    const before = buildCrmDemo(service.snapshot());
    expect(before.call_previews.find((item) => item.id === unknown.id)?.status).toBe("unknown");
    const deal = service.snapshot().deals.find((item) => item.contact_id === unknown.contact_id)!;
    const result = event({ event_id: "mock:reconciled", call_id: unknown.id, contact_id: unknown.contact_id, deal_id: deal.id });
    expect((await service.recordCallResult(ctx, result)).ok).toBe(true);
    const after = buildCrmDemo(service.snapshot());
    expect(after.call_previews.find((item) => item.id === unknown.id)).toMatchObject({ status: "completed", started_at: unknown.started_at, summary: result.summary });
    expect(after.call_previews.filter((item) => item.contact_id === unknown.contact_id && item.status === "unknown")).toEqual([]);
    expect(after.call_previews.filter((item) => item.id === unknown.id)).toHaveLength(1);
    expect(after.activities.some((item) => item.kind === "call_result_recorded" && item.summary.includes(result.summary))).toBe(true);
  });

  it("filtra todas las colecciones por empresa y no muta fixtures ni el snapshot", async () => {
    const service = createMockCrm();
    await service.recordCallResult(ctx, event());
    const snapshot = service.snapshot();
    const before = structuredClone(snapshot);
    const other = buildCrmDemo(snapshot, "orbita");
    for (const list of [other.contacts, other.deals, other.tasks, other.call_results, other.call_previews, other.activities]) {
      expect(list.every((item) => item.company_id === fixtures.companies[1].id)).toBe(true);
    }
    expect(other.call_previews.some((item) => item.id === event().call_id)).toBe(false);
    other.contacts[0].name = "afuera";
    expect(snapshot).toEqual(before);
    expect(buildCrmDemo(service.snapshot()).contacts[0].name).toBe("Alicia Demo");
    expect(buildCrmDemo(snapshot, ["orbita"]).demo).toBe("prisma");
    expect(buildCrmDemo(snapshot, "company_id_ajeno").demo).toBe("prisma");
  });
});
