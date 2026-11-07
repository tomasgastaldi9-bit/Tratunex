import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../mocks/fixtures.json";
import { clearContactAction, contactActionId, saveContactAction } from "./contact-action-client";

afterEach(() => vi.unstubAllGlobals());

describe("CRM03: identidad de la intención de guardado", () => {
  it("recupera la misma clave al reintentar y almacena solo hash e ID", async () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value), removeItem: (key: string) => values.delete(key) });
    const input = { phone_e164: "+12025550199", name: "Ejemplo ficticio" };
    const first = await contactActionId("company:contact", input);
    expect(await contactActionId("company:contact", input)).toBe(first);
    expect([...values.values()].join()).not.toContain(input.phone_e164);
    expect([...values.values()].join()).not.toContain(input.name);
    expect(await contactActionId("company:contact", { ...input, name: "Otro ejemplo" })).not.toBe(first);
    clearContactAction("company:contact");
    expect(values.size).toBe(0);
    expect(await contactActionId("company:contact", input)).not.toBe(first);
  });

  it("permite generar una intención cuando el almacenamiento está deshabilitado", async () => {
    vi.stubGlobal("sessionStorage", { getItem: () => { throw new Error("Unavailable"); }, setItem: () => { throw new Error("Unavailable"); } });
    expect(await contactActionId("company:new", {})).toMatch(/^[a-f0-9-]{36}$/);
  });
});

describe("CRM03: confirmación de la mutación de contactos", () => {
  const contact = fixtures.contacts[0];

  it.each(["POST", "PATCH"] as const)("envía %s con acción estable y sin autoridad en el cuerpo", async method => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { contact, created: method === "POST" } }));
    vi.stubGlobal("fetch", fetcher);
    const input = { name: "Ejemplo ficticio" };
    const result = await saveContactAction("/api/crm/contacts", method, "stable-key", input, contact.company_id);
    expect(result.ok).toBe(true);
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1]).toMatchObject({ method, credentials: "same-origin", headers: { "Idempotency-Key": "stable-key" } });
    expect(JSON.parse(String(request[1].body))).toEqual({ action_id: "stable-key", input });
  });

  it("rechaza éxito contradictorio con HTTP 500 y datos de otra empresa", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { contact } }, { status: 500 })));
    await expect(saveContactAction("/api/crm/contacts", "POST", "key", {}, contact.company_id)).rejects.toThrow();
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { contact } })));
    await expect(saveContactAction("/api/crm/contacts", "POST", "key", {}, fixtures.companies[1].id)).rejects.toThrow();
  });

  it("conserva errores explícitos y rechaza respuestas incompatibles", async () => {
    const failure = { ok: false, error: { code: "CONFLICT", message: "Conflicto", retryable: false } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(failure, { status: 409 })));
    expect(await saveContactAction("/api/crm/contacts", "PATCH", "key", {}, contact.company_id)).toEqual(failure);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { contact: { id: contact.id } } })));
    await expect(saveContactAction("/api/crm/contacts", "PATCH", "key", {}, contact.company_id)).rejects.toThrow();
  });
});
