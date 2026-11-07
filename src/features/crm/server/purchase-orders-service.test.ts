import { describe, expect, it, vi } from "vitest";
import type { ActionCtx } from "../../../contracts/common";
import { PurchaseOrderSchema, type OrderPayment } from "../../../contracts/purchase-orders";
import { createPurchaseOrdersCrm } from "./purchase-orders-service";

const id = "10000000-0000-4000-8000-000000000001";
const other = "20000000-0000-4000-8000-000000000001";
const ctx: ActionCtx = { company_id: id, actor_id: id, actor_type: "user", action_id: "order-stable-action" };
const order = PurchaseOrderSchema.parse({
  id, company_id: id, purchase_request_id: id, supplier_quote_id: id, supplier_contact_id: id,
  product: "Producto ficticio", quantity: 2, unit: "unidades", supplier_name: "Proveedor ficticio", quote_source: "call",
  quoted_unit_price: "1", quoted_total: "2", quoted_currency: "ARGt", amount_atomic: "2000000000000000000", pricing_status: "ready",
  status: "approved", version: 2, wallet: { chain: "arbitrum", address: `0x${"a".repeat(40)}` }, wallet_version: 1,
  approved_by: id, approved_at: "2026-11-07T12:00:00Z", created_at: "2026-11-07T12:00:00.000Z", updated_at: "2026-11-07T12:00:00.000Z",
});
const pending = { ...order, status: "awaiting_approval" as const, approved_by: null, approved_at: null, version: 1 };
const payment: OrderPayment = { id: other, status: "unknown", tx_hash: `0x${"1".repeat(64)}`, explorer_url: `https://arbiscan.io/tx/0x${"1".repeat(64)}`, amount_atomic: order.amount_atomic!, token: "ARGt", chain: "arbitrum" };
const execute = () => vi.fn(async () => ({ data: { ok: true, data: { order } }, error: null }));

describe("ORD-03 servicio persistido y pago desconectado por defecto", () => {
  it("publica lectura real y valida scope de empresa en el resultado", async () => {
    const rpc = execute();
    const crm = createPurchaseOrdersCrm(rpc);
    expect(await crm.getPurchaseOrder(ctx, { order_id: id })).toMatchObject({ ok: true, data: { order } });
    expect(rpc).toHaveBeenCalledWith({ company_id: ctx.company_id, actor_id: ctx.actor_id, actor_type: ctx.actor_type }, "getPurchaseOrder", { order_id: id });
    rpc.mockResolvedValueOnce({ data: { ok: true, data: { order: { ...order, company_id: other } } }, error: null });
    expect(await crm.getPurchaseOrder(ctx, { order_id: id })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
  it("sin PAY-02 no cambia la aprobación ni devuelve un pago ficticio", async () => {
    const rpc = execute();
    const crm = createPurchaseOrdersCrm(rpc);
    expect(crm.paymentAvailable).toBe(false);
    expect(await crm.approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: false } });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("un stub presente pero no disponible no habilita pago ni guarda aprobación", async () => {
    const rpc = execute();
    const payInvoice = vi.fn(async () => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Stub", retryable: false } }) as const);
    const crm = createPurchaseOrdersCrm(rpc, { availability: "unavailable", payInvoice });
    expect(crm.paymentAvailable).toBe(false);
    expect(await crm.approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    expect(rpc).not.toHaveBeenCalled(); expect(payInvoice).not.toHaveBeenCalled();
  });
  it.each(["voice", "system"] as const)("%s no crea, aprueba, refresca ni inicia pagos", async actor_type => {
    const rpc = execute();
    const payInvoice = vi.fn();
    const crm = createPurchaseOrdersCrm(rpc, { availability: "ready", payInvoice });
    const actor = { ...ctx, actor_type };
    for (const result of [await crm.createPurchaseOrder(actor, { supplier_quote_id: id }), await crm.approvePurchaseOrder(actor, { order_id: id, expected_version: 1 }), await crm.refreshPurchaseOrder(actor, { order_id: id, expected_version: 1 }), await crm.approveAndPayPurchaseOrder(actor, { order_id: id, expected_version: 1 })]) {
      expect(result).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    }
    expect(rpc).not.toHaveBeenCalled(); expect(payInvoice).not.toHaveBeenCalled();
  });
  it("no acepta monto ni destinatario en las mutaciones", async () => {
    const rpc = execute();
    const crm = createPurchaseOrdersCrm(rpc);
    expect(await crm.createPurchaseOrder(ctx, { supplier_quote_id: id, amount_atomic: "1" } as never)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await crm.approvePurchaseOrder(ctx, { order_id: id, expected_version: 1, wallet: order.wallet } as never)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(rpc).not.toHaveBeenCalled();
  });
  it("falla ante un esquema ausente sin simular éxito", async () => {
    const crm = createPurchaseOrdersCrm(async () => ({ data: null, error: { code: "42883" } }));
    expect(await crm.getPurchaseOrder(ctx, { order_id: id })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
  it("el puerto PAY recibe solo order_id y conserva action_id tras aprobación", async () => {
    const rpc = execute();
    const payInvoice = vi.fn(async () => ({ ok: true, data: { payment } }) as const);
    const crm = createPurchaseOrdersCrm(rpc, { availability: "ready", payInvoice });
    expect(await crm.approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 })).toMatchObject({ ok: true, data: { order, payment: { status: "unknown" } } });
    expect(payInvoice).toHaveBeenCalledWith(ctx, { order_id: id });
    expect(rpc).toHaveBeenCalledWith(ctx, "approvePurchaseOrder", { order_id: id, expected_version: 1 });
  });
  it("no llama PAY si la aprobación falla o no está vigente", async () => {
    const rpc = execute(); const payInvoice = vi.fn();
    rpc.mockResolvedValueOnce({ data: { ok: true, data: { order: pending } }, error: null });
    const crm = createPurchaseOrdersCrm(rpc, { availability: "ready", payInvoice });
    expect(await crm.approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(payInvoice).not.toHaveBeenCalled();
  });
  it("un resultado ambiguo de PAY conserva un fallo explícito y no reintenta", async () => {
    const payInvoice = vi.fn(async () => { throw new Error("detalle privado"); });
    const result = await createPurchaseOrdersCrm(execute(), { availability: "ready", payInvoice }).approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 });
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(payInvoice).toHaveBeenCalledTimes(1); expect(JSON.stringify(result)).not.toContain("privado");
  });
  it("no acepta importe de pago distinto del aprobado", async () => {
    const payInvoice = vi.fn(async () => ({ ok: true, data: { payment: { ...payment, amount_atomic: "1" } } }) as const);
    expect(await createPurchaseOrdersCrm(execute(), { availability: "ready", payInvoice }).approveAndPayPurchaseOrder(ctx, { order_id: id, expected_version: 1 })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
});
