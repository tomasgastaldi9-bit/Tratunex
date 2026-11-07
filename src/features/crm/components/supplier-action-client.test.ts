import { afterEach, describe, expect, it, vi } from "vitest";
import fixtures from "../mocks/fixtures.json";
import { saveSupplierAction, supplierActionMessage } from "./supplier-action-client";

afterEach(() => vi.unstubAllGlobals());

const supplier = { ...fixtures.contacts[0], is_supplier: true,
  collection_wallet: null, wallet_version: 0, wallet_updated_at: null };
const wallet = { chain: "base", address: `0x${"Ab".repeat(20)}` };
const configured = { ...supplier, collection_wallet: wallet, wallet_version: 1, wallet_updated_at: "2026-11-07T15:00:00Z" };

describe("ORD01: confirmación de datos del proveedor", () => {
  it.each(["POST", "PATCH"] as const)("envía %s con el envelope de acción estable", async method => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { supplier, created: method === "POST" } }));
    vi.stubGlobal("fetch", fetcher);
    const input = { name: "Proveedor ficticio", phone_e164: "+12025550190" };
    expect((await saveSupplierAction("/api/crm/suppliers", method, "stable-action", input, supplier.company_id)).ok).toBe(true);
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(request[1]).toMatchObject({ method, credentials: "same-origin", headers: { "Idempotency-Key": "stable-action" } });
    expect(JSON.parse(String(request[1].body))).toEqual({ action_id: "stable-action", input });
    expect(JSON.parse(String(request[1].body)).input).not.toHaveProperty("collection_wallet");
  });

  it("rechaza éxito HTTP 500, otra empresa y otro proveedor", async () => {
    for (const [status, returned] of [[500, supplier], [200, { ...supplier, company_id: fixtures.companies[1].id }],
      [200, { ...supplier, id: "90000000-0000-4000-8000-000000000099" }]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { supplier: returned } }, { status })));
      await expect(saveSupplierAction("/api/crm/suppliers", "PATCH", "action", {}, supplier.company_id, supplier.id)).rejects.toThrow();
    }
  });

  it("rechaza un contacto sin el rol proveedor", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { supplier: { ...supplier, is_supplier: false } } })));
    await expect(saveSupplierAction("/api/crm/suppliers", "POST", "action", {}, supplier.company_id)).rejects.toThrow();
  });

  it("mantiene CONFLICT explícito y da una indicación específica para billetera", async () => {
    const failure = { ok: false, error: { code: "CONFLICT", message: "Versión anterior", retryable: false } };
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(failure, { status: 409 })));
    expect(await saveSupplierAction("/api/crm/suppliers/wallet", "POST", "action", {}, supplier.company_id)).toEqual(failure);
    expect(supplierActionMessage("CONFLICT", "wallet")).toContain("La billetera cambió");
  });
});

describe("ORD01: billetera humana separada", () => {
  it("conserva expected_wallet_version y acepta un no-op con casing previo", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { supplier: configured } }));
    vi.stubGlobal("fetch", fetcher);
    const input = { collection_wallet: { ...wallet, address: wallet.address.toLowerCase() }, expected_wallet_version: 1 };
    expect((await saveSupplierAction("/api/crm/suppliers/wallet", "POST", "stable-wallet", input, supplier.company_id, supplier.id)).ok).toBe(true);
    const request = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(JSON.parse(String(request[1].body))).toEqual({ action_id: "stable-wallet", input });
  });

  it("rechaza una confirmación con otra red o dirección", async () => {
    for (const returned of [{ ...configured, collection_wallet: { ...wallet, chain: "arbitrum" } },
      { ...configured, collection_wallet: { ...wallet, address: `0x${"cd".repeat(20)}` } }]) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { supplier: returned } })));
      await expect(saveSupplierAction("/api/crm/suppliers/wallet", "POST", "action", { collection_wallet: wallet, expected_wallet_version: 0 }, supplier.company_id, supplier.id)).rejects.toThrow();
    }
  });

  it("solo confirma quitar la billetera cuando la respuesta queda pendiente", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { supplier } })));
    expect((await saveSupplierAction("/api/crm/suppliers/wallet", "POST", "clear", { collection_wallet: null, expected_wallet_version: 1 }, supplier.company_id, supplier.id)).ok).toBe(true);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { supplier: configured } })));
    await expect(saveSupplierAction("/api/crm/suppliers/wallet", "POST", "clear", { collection_wallet: null, expected_wallet_version: 1 }, supplier.company_id, supplier.id)).rejects.toThrow();
  });
});
