import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { upsertContact, crmIntegration } from "../../crm/server/mock-public";
import { toContactInput, csvRecordToContact, mapPersistedCandidates } from "./mapping";

const company_id = "10000000-0000-4000-8000-000000000001";
const actor_id = "30000000-0000-4000-8000-000000000001";
const candidate = { name: "Demo", phone: "+1 (202) 555-0123", website: "https://demo.example", source_url: "https://demo.example/contact", evidence: "Teléfono: +1 (202) 555-0123" };

describe("mapeo para CRM", () => {
  it("solo admite candidatos guardados de búsquedas reales", () => {
    const row = { ...candidate, id: "one", prospect_searches: { mode: "live" as const } };
    expect(mapPersistedCandidates(["one"], [row])).toMatchObject({ ok: true, data: [{ source: { kind: "firecrawl" } }] });
    expect(mapPersistedCandidates(["one"], [{ ...row, prospect_searches: { mode: "mock" } }])).toMatchObject({ ok: false });
    expect(mapPersistedCandidates(["other"], [row])).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });
  it("preserva el origen y exige un teléfono internacional", () => {
    const result = toContactInput(candidate, "live");
    expect(result).toMatchObject({ ok: true, data: { name: "Demo", phone_e164: "+12025550123", source: { kind: "firecrawl", url: "https://demo.example/contact" } } });
    expect(toContactInput({ ...candidate, phone: null }, "live")).toMatchObject({ ok: false });
    expect(toContactInput(candidate, "mock")).toMatchObject({ ok: false });
    expect(toContactInput({ ...candidate, website: "https://españa.example" }, "live")).toMatchObject({ ok: false });
    expect(toContactInput({ ...candidate, phone: "0351 123 4567" }, "live")).toMatchObject({ ok: false });
  });
  it("el mock no duplica el mismo contacto y conserva do_not_contact", async () => {
    expect(crmIntegration.mode).toBe("mock");
    const mapped = toContactInput(candidate, "live");
    if (!mapped.ok) throw new Error("El fixture debería ser válido");
    const ctx = { company_id, actor_id, actor_type: "user" as const };
    const created = await upsertContact({ ...ctx, action_id: "primera" }, { ...mapped.data, do_not_contact: true });
    const again = await upsertContact({ ...ctx, action_id: "segunda" }, mapped.data);
    expect(created.ok && created.data.created).toBe(true);
    expect(again.ok && again.data.created).toBe(false);
    if (created.ok && again.ok) {
      expect(again.data.contact.id).toBe(created.data.contact.id);
      expect(again.data.contact.do_not_contact).toBe(true);
    }
  });
  it("mapea un registro CSV válido sin borrar preferencias de contacto", () => {
    const result = csvRecordToContact({ row: 1, name: "Empresa CSV", phone_e164: "+12025550123", website: null, errors: [] });
    expect(result).toMatchObject({ ok: true, data: { name: "Empresa CSV", phone_e164: "+12025550123", source: { kind: "csv", url: null } } });
    if (result.ok) expect(result.data).not.toHaveProperty("do_not_contact");
    expect(csvRecordToContact({ row: 2, name: "Falla", phone_e164: null, website: null, errors: ["Teléfono inválido"] })).toMatchObject({ ok: false });
  });});
