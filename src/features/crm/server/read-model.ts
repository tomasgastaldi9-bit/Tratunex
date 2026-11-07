import { createHash } from "node:crypto";
import type { CallResultV1, ContactDTO, DealDTO, TaskDTO } from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import type { MockCrmSeed } from "./mock-crm";

export type DemoCompany = "prisma" | "orbita";
export type CrmDemoActivity = Omit<(typeof fixtures.activities)[number], "deal_id"> & { deal_id: string | null };
export type CrmDemoData = {
  mode: "mock";
  now: string;
  demo: DemoCompany;
  company: (typeof fixtures.companies)[number];
  contacts: ContactDTO[];
  deals: DealDTO[];
  tasks: TaskDTO[];
  call_results: CallResultV1[];
  call_previews: (typeof fixtures.call_previews)[number][];
  activities: CrmDemoActivity[];
};

// Deterministic UUIDv8 for a derived mock activity, stable across page reads.
function activityId(event: CallResultV1): string {
  const hex = createHash("sha256").update(JSON.stringify([event.company_id, event.event_id])).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-8${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}

/** Pure projection of the current mock store. It never mutates fixtures or input. */
export function buildCrmDemo(snapshot: MockCrmSeed, value?: string | string[]): CrmDemoData {
  const demo: DemoCompany = value === "orbita" ? "orbita" : "prisma";
  const company = fixtures.companies[demo === "orbita" ? 1 : 0];
  const belongs = (item: { company_id: string }) => item.company_id === company.id;
  const callResults = snapshot.call_results.filter(belongs);
  const previews = new Map(fixtures.call_previews.filter(belongs).map((preview) => [preview.id, { ...preview }]));

  // Latest result resolves an unknown preview. Preserve its actual start time;
  // for newly simulated calls, occurred_at is the only timestamp available.
  for (const event of [...callResults].sort((a, b) => Date.parse(a.occurred_at) - Date.parse(b.occurred_at))) {
    const previous = previews.get(event.call_id);
    previews.set(event.call_id, {
      id: event.call_id,
      company_id: event.company_id,
      contact_id: event.contact_id,
      status: event.technical_status,
      mode: "mock",
      started_at: previous?.started_at ?? event.occurred_at,
      summary: event.summary,
    });
  }

  const activities: CrmDemoActivity[] = fixtures.activities.filter(belongs).map((activity) => ({ ...activity }));
  const existingEvents = new Set(fixtures.call_results.filter(belongs).map((event) => event.event_id));
  for (const event of callResults) {
    if (existingEvents.has(event.event_id)) continue;
    activities.push({
      id: activityId(event), company_id: event.company_id, contact_id: event.contact_id,
      deal_id: event.deal_id, kind: "call_result_recorded", occurred_at: event.occurred_at,
      summary: `Resultado simulado registrado: ${event.summary}`,
    });
    existingEvents.add(event.event_id);
  }

  return structuredClone({
    mode: "mock", now: fixtures.now, demo, company,
    contacts: snapshot.contacts.filter(belongs),
    deals: snapshot.deals.filter(belongs),
    tasks: snapshot.tasks.filter(belongs),
    call_results: callResults,
    call_previews: [...previews.values()],
    activities,
  });
}
