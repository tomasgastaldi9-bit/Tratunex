import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseOrderSchema } from "../../../contracts/purchase-orders";
import { createOrderFromQuote } from "./purchase-order-create-button";

afterEach(() => vi.unstubAllGlobals());

const order = PurchaseOrderSchema.parse({ id: "80000000-0000-4000-8000-000000000001", company_id: "10000000-0000-4000-8000-000000000001",
  purchase_request_id: "50000000-0000-4000-8000-000000000001", supplier_quote_id: "60000000-0000-4000-8000-000000000001",
  supplier_contact_id: "20000000-0000-4000-8000-000000000001", product: "Insumos ficticios", quantity: 5, unit: "unidades",
  supplier_name: "Proveedor ficticio", quote_source: "web", quoted_unit_price: "2.00", quoted_total: "10.00", quoted_currency: "ARGt",
  amount_atomic: "10000000000000000000", pricing_status: "ready", status: "awaiting_approval", version: 1,
  wallet: { chain: "arbitrum", address: `0x${"ab".repeat(20)}` }, wallet_version: 1, approved_by: null, approved_at: null,
  created_at: "2026-11-07T15:00:00Z", updated_at: "2026-11-07T15:00:00Z" });

describe("ORD03: crear una orden desde una cotización elegida", () => {
  it("envía solo quote ID y acción estable, sin importes o wallet de navegador", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { order, created: true } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await createOrderFromQuote(order.company_id, order.supplier_quote_id, "stable-create")).ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/crm/orders");
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Idempotency-Key": "stable-create" } });
    expect(JSON.parse(String(options.body))).toEqual({ action_id: "stable-create", input: { supplier_quote_id: order.supplier_quote_id } });
  });

  it("acepta una orden existente para la misma cotización", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { order, created: false } })));
    const result = await createOrderFromQuote(order.company_id, order.supplier_quote_id, "stable-create");
    expect(result).toMatchObject({ ok: true, data: { created: false, order: { id: order.id } } });
  });

  it("rechaza éxito HTTP 500, otra empresa y otra cotización", async () => {
    for (const [status, returned] of [[500, order], [200, { ...order, company_id: "10000000-0000-4000-8000-000000000099" }],
      [200, { ...order, supplier_quote_id: "60000000-0000-4000-8000-000000000099" }]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { order: returned, created: true } }, { status })));
      await expect(createOrderFromQuote(order.company_id, order.supplier_quote_id, "stable-create")).rejects.toThrow();
    }
  });

  it("mantiene el error explícito y nunca reintenta automáticamente", async () => {
    const failure = { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Servicio pendiente", retryable: true } };
    const fetcher = vi.fn(async () => Response.json(failure, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await createOrderFromQuote(order.company_id, order.supplier_quote_id, "stable-create")).toEqual(failure);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
