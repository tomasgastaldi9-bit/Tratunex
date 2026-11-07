import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../mocks/fixtures.json";
import { readPipelineContact, savePipelineAction, searchPipelineContacts } from "./pipeline-action-client";

afterEach(() => vi.unstubAllGlobals());

describe("CRM04: confirmación de oportunidades", () => {
  const deal = fixtures.deals[0];

  it("conserva intención y expected_stage al guardar una etapa", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { deal: { ...deal, stage: "won" } } }));
    vi.stubGlobal("fetch", fetcher);
    const input = { stage: "won", expected_stage: deal.stage };
    expect((await savePipelineAction(`/api/crm/deals/${deal.id}/stage`, "stable-action", input, deal.company_id, deal.id)).ok).toBe(true);
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1]).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Idempotency-Key": "stable-action" } });
    expect(JSON.parse(String(request[1].body))).toEqual({ action_id: "stable-action", input });
  });

  it("rechaza éxito con HTTP 500, otra empresa u otra oportunidad", async () => {
    for (const [status, responseDeal] of [[500, deal], [200, { ...deal, company_id: fixtures.companies[1].id }],
      [200, { ...deal, id: "90000000-0000-4000-8000-000000000099" }]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { deal: responseDeal } }, { status })));
      await expect(savePipelineAction("/api/crm/deals/stage", "action", {}, deal.company_id, deal.id)).rejects.toThrow();
    }
  });

  it("rechaza confirmación de otra etapa o contacto", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { deal } })));
    await expect(savePipelineAction("/api/crm/deals/stage", "action", { stage: "won" }, deal.company_id, deal.id)).rejects.toThrow();
    await expect(savePipelineAction("/api/crm/deals", "action", { contact_id: fixtures.contacts.find(contact => contact.id !== deal.contact_id)!.id }, deal.company_id)).rejects.toThrow();
  });

  it("mantiene CONFLICT explícito y rechaza DTO inválido", async () => {
    const failure = { ok: false, error: { code: "CONFLICT", message: "Cambió la etapa", retryable: false } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(failure, { status: 409 })));
    expect(await savePipelineAction("/api/crm/deals/stage", "action", {}, deal.company_id)).toEqual(failure);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { deal: { id: deal.id } } })));
    await expect(savePipelineAction("/api/crm/deals", "action", {}, deal.company_id)).rejects.toThrow();
  });
});

describe("CRM04: selector de contactos con búsqueda y paginación de servidor", () => {
  const contact = fixtures.contacts[0];

  it("envía query y cursor sin recortar la búsqueda a contactos cargados", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { items: [contact], next_cursor: contact.id } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await searchPipelineContacts(contact.company_id, "Nombre & Empresa", contact.id)).ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    const parsed = new URL(url, "http://localhost");
    expect(parsed.pathname).toBe("/api/crm/contacts");
    expect(parsed.searchParams.get("query")).toBe("Nombre & Empresa");
    expect(parsed.searchParams.get("cursor")).toBe(contact.id);
    expect(parsed.searchParams.get("limit")).toBe("50");
    expect(options).toMatchObject({ cache: "no-store", credentials: "same-origin" });
  });

  it("rechaza contactos de otra empresa tanto en búsqueda como preselección", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { items: [contact], next_cursor: null } })));
    await expect(searchPipelineContacts(fixtures.companies[1].id, "")).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { contact } })));
    await expect(readPipelineContact(fixtures.companies[1].id, contact.id)).rejects.toThrow();
  });

  it("lee el contacto contextual para preseleccionarlo aunque no esté en la primera página", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { contact } })));
    expect(await readPipelineContact(contact.company_id, contact.id)).toEqual({ ok: true, data: { contact } });
  });
});
