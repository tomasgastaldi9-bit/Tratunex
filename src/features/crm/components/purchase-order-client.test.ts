import { afterEach, describe, expect, it, vi } from "vitest";
import { PurchaseOrderSchema, type OrderPayment } from "../../../contracts/purchase-orders";
import { formatOrderArgt, formatOrderQuoted, orderPaymentPresentation, parseOrderPaymentIntent, paymentBlockedReason,
  paymentIntentKey, postOrderPayment, readOrderPaymentIntent, refreshOrderSnapshot, storeOrderPaymentIntent } from "./purchase-order-client";

afterEach(() => vi.unstubAllGlobals());

const order = PurchaseOrderSchema.parse({ id: "80000000-0000-4000-8000-000000000001", company_id: "10000000-0000-4000-8000-000000000001",
  purchase_request_id: "50000000-0000-4000-8000-000000000001", supplier_quote_id: "60000000-0000-4000-8000-000000000001",
  supplier_contact_id: "20000000-0000-4000-8000-000000000001", product: "Insumos ficticios", quantity: 5, unit: "unidades",
  supplier_name: "Proveedor ficticio", quote_source: "web", quoted_unit_price: "2.00", quoted_total: "10.00", quoted_currency: "ARGt",
  amount_atomic: "10000000000000000000", pricing_status: "ready", status: "awaiting_approval", version: 1,
  wallet: { chain: "arbitrum", address: `0x${"ab".repeat(20)}` }, wallet_version: 1, approved_by: null, approved_at: null,
  created_at: "2026-11-07T15:00:00Z", updated_at: "2026-11-07T15:00:00Z" });
const approved = { ...order, status: "approved" as const, version: 2, approved_by: "30000000-0000-4000-8000-000000000001", approved_at: "2026-11-07T15:01:00Z" };
const hash = `0x${"12".repeat(32)}`;
const payment: OrderPayment = { id: "90000000-0000-4000-8000-000000000001", status: "confirmed", tx_hash: hash,
  explorer_url: `https://arbiscan.io/tx/${hash}`, amount_atomic: order.amount_atomic!, token: "ARGt", chain: "arbitrum" };

describe("ORD03: importes y estados del pago", () => {
  it("presenta textos decimales y escala ARGt exactamente, sin Number", () => {
    expect(formatOrderQuoted("9007199254740993.0100", "USD")).toBe("USD 9.007.199.254.740.993,0100");
    expect(formatOrderArgt("9007199254740993123456789012345678")).toBe("ARGt 9.007.199.254.740.993,123456789012345678");
  });

  it("deshabilita pago sin adapter, conversión, billetera, red compatible o fuente real", () => {
    expect(paymentBlockedReason(order, false)).toContain("pendiente de integración");
    expect(paymentBlockedReason({ ...order, quoted_currency: "USD", pricing_status: "pending_conversion", amount_atomic: null }, true)).toContain("conversión");
    expect(paymentBlockedReason({ ...order, wallet: null }, true)).toContain("billetera");
    expect(paymentBlockedReason({ ...order, wallet: { chain: "arbitrum", address: `0x${"0".repeat(40)}` } }, true)).toContain("billetera");
    expect(paymentBlockedReason({ ...order, wallet: { ...order.wallet!, chain: "base" } }, true)).toContain("Arbitrum");
    expect(paymentBlockedReason({ ...order, quote_source: "example" }, true)).toContain("ejemplo");
    expect(paymentBlockedReason(approved, true)).toContain("ya está aprobada");
    expect(paymentBlockedReason(order, true, payment)).toContain("intento");
    expect(paymentBlockedReason(order, true)).toBeNull();
  });

  it("solo llama Pagada a confirmed con hash, explorer y monto correspondientes", () => {
    expect(orderPaymentPresentation(payment, approved).label).toBe("Pagada");
    expect(orderPaymentPresentation({ ...payment, tx_hash: null, explorer_url: null }, approved).label).toBe("Verificación pendiente");
    expect(orderPaymentPresentation({ ...payment, explorer_url: `https://foreign.example/tx/${hash}` }, approved).label).toBe("Verificación pendiente");
    expect(orderPaymentPresentation({ ...payment, amount_atomic: "1" }, approved).label).toBe("Verificación pendiente");
    expect(orderPaymentPresentation(payment, order).label).toBe("Verificación pendiente");
    expect(orderPaymentPresentation(null, approved).label).toBe("Verificación pendiente");
  });

  it.each(["reserved", "prepared", "submitted", "pending", "unknown", "reverted", "failed"] as const)("un hash en estado %s no confirma pago", status => {
    const result = orderPaymentPresentation({ ...payment, status }, approved);
    expect(result.label).not.toBe("Pagada");
    if (status === "unknown") expect(result.label).toBe("Verificación pendiente");
    if (status === "failed" || status === "reverted") expect(result.label).toBe("Falló");
  });
});

describe("ORD03: peticiones manuales con autoridad de servidor", () => {
  it("pagar envía solo expected_version y conserva action_id", async () => {
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { order: approved, payment } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await postOrderPayment(order, "stable-pay", 1)).ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/crm/orders/${order.id}/pay`);
    expect(options).toMatchObject({ method: "POST", credentials: "same-origin", headers: { "Idempotency-Key": "stable-pay" } });
    expect(JSON.parse(String(options.body))).toEqual({ action_id: "stable-pay", input: { expected_version: 1 } });
  });

  it("rechaza éxito HTTP 500, otra orden, otro importe y otra billetera", async () => {
    for (const [status, returned] of [[500, approved], [200, { ...approved, id: "80000000-0000-4000-8000-000000000099" }],
      [200, { ...approved, amount_atomic: "1" }], [200, { ...approved, wallet: { chain: "arbitrum", address: `0x${"cd".repeat(20)}` } }]] as const) {
      vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { order: returned, payment } }, { status })));
      await expect(postOrderPayment(order, "stable-pay", 1)).rejects.toThrow();
    }
  });

  it("conserva un fallo explícito y no trata unknown como error a reintentar", async () => {
    const failure = { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Pendiente", retryable: true } };
    const fetcher = vi.fn(async () => Response.json(failure, { status: 503 }));
    vi.stubGlobal("fetch", fetcher);
    expect(await postOrderPayment(order, "stable-pay", 1)).toEqual(failure);
    expect(fetcher).toHaveBeenCalledTimes(1);
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, data: { order: approved, payment: { ...payment, status: "unknown" } } })));
    const result = await postOrderPayment(order, "stable-pay", 1);
    expect(result.ok && result.data.payment?.status).toBe("unknown");
  });

  it("actualizar snapshot no envía importe, wallet ni petición de pago", async () => {
    const updated = { ...order, version: 2, wallet_version: 2 };
    const fetcher = vi.fn(async () => Response.json({ ok: true, data: { order: updated } }));
    vi.stubGlobal("fetch", fetcher);
    expect((await refreshOrderSnapshot(order, "stable-refresh", 1)).ok).toBe(true);
    const [url, options] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`/api/crm/orders/${order.id}/refresh`);
    expect(JSON.parse(String(options.body))).toEqual({ action_id: "stable-refresh", input: { expected_version: 1 } });
  });
});

describe("ORD03: intención ambigua se conserva para consultar, nunca habilita pagos", () => {
  it("persiste solo la identidad y versión, sin importes o credenciales", () => {
    const values = new Map<string, string>();
    vi.stubGlobal("sessionStorage", { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) });
    vi.stubGlobal("window", { dispatchEvent: vi.fn() });
    const key = paymentIntentKey(order);
    const intent = { action_id: "stable-pay", expected_version: 1 };
    storeOrderPaymentIntent(key, intent);
    expect(parseOrderPaymentIntent(readOrderPaymentIntent(key))).toEqual(intent);
    expect(JSON.parse(values.get(key)!)).toEqual(intent);
    expect(parseOrderPaymentIntent(JSON.stringify({ ...intent, amount_atomic: "1" }))).toBeNull();
    expect(parseOrderPaymentIntent("invalid")).toBeNull();
  });
});
