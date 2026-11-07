import { describe, expect, expectTypeOf, it } from "vitest";
import type { Ctx, Result } from "./common";
import {
  ApprovePurchaseOrderInputSchema, CreatePurchaseOrderInputSchema, OrderPaymentSchema,
  PurchaseOrderSchema, type GetPurchaseOrder, type PurchaseOrder,
} from "./purchase-orders";

const id = "10000000-0000-4000-8000-000000000001";
const pending = {
  id, company_id: id, purchase_request_id: id, supplier_quote_id: id, supplier_contact_id: id,
  product: "Vasos ficticios", quantity: 500, unit: "unidades", supplier_name: "Proveedor ficticio",
  quote_source: "call", quoted_unit_price: "2.50", quoted_total: "1250.00", quoted_currency: "ARS",
  amount_atomic: null, pricing_status: "pending_conversion", status: "awaiting_approval", version: 1,
  wallet: { chain: "arbitrum", address: `0x${"a".repeat(40)}` }, wallet_version: 1,
  approved_by: null, approved_at: null, created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z",
};
describe("ORD-03 contrato mínimo de orden", () => {
  it("publica lectura con Ctx y Result comunes", () => {
    expectTypeOf<GetPurchaseOrder>().toEqualTypeOf<(ctx: Ctx, input: { order_id: string }) => Promise<Result<{ order: PurchaseOrder }>>>();
  });
  it("conserva ARS pendiente separado del importe ARGt", () => {
    expect(PurchaseOrderSchema.parse(pending)).toMatchObject({ quoted_total: "1250.00", amount_atomic: null, pricing_status: "pending_conversion" });
    expect(PurchaseOrderSchema.safeParse({ ...pending, pricing_status: "ready" }).success).toBe(false);
  });
  it("no acepta monto, destino o empresa suministrados al crear/aprobar", () => {
    expect(CreatePurchaseOrderInputSchema.parse({ supplier_quote_id: id })).toEqual({ supplier_quote_id: id });
    for (const fields of [{ amount_atomic: "1" }, { wallet: pending.wallet }, { company_id: id }]) {
      expect(CreatePurchaseOrderInputSchema.safeParse({ supplier_quote_id: id, ...fields }).success).toBe(false);
      expect(ApprovePurchaseOrderInputSchema.safeParse({ order_id: id, expected_version: 1, ...fields }).success).toBe(false);
    }
  });
  it("aprobación exige importe, fuente real, Arbitrum y una versión de billetera", () => {
    const approved = { ...pending, amount_atomic: "1250000000000000000000", pricing_status: "ready", status: "approved", approved_by: id, approved_at: pending.created_at };
    expect(PurchaseOrderSchema.safeParse(approved).success).toBe(true);
    for (const fields of [{ amount_atomic: null }, { approved_by: null }, { wallet: null }, { wallet_version: 0 }, { quote_source: "example" }, { wallet: { ...pending.wallet, chain: "base" } }]) {
      expect(PurchaseOrderSchema.safeParse({ ...approved, ...fields }).success).toBe(false);
    }
  });
  it.each(["0", "-1", "1.5", "1e18", "01", (BigInt(2) ** BigInt(256)).toString()])("rechaza importe inválido o fuera de uint256: %s", amount_atomic => {
    expect(PurchaseOrderSchema.safeParse({ ...pending, amount_atomic, pricing_status: "ready" }).success).toBe(false);
  });
  it("no afirma pago confirmado sin hash y enlace verificable de Arbitrum", () => {
    const hash = `0x${"a".repeat(64)}`;
    const payment = { id, status: "confirmed", tx_hash: hash, explorer_url: `https://arbiscan.io/tx/${hash}`, amount_atomic: "1", token: "ARGt", chain: "arbitrum" };
    expect(OrderPaymentSchema.safeParse(payment).success).toBe(true);
    for (const fields of [{ tx_hash: null }, { explorer_url: null }, { explorer_url: "https://example.test/tx/fake" }]) {
      expect(OrderPaymentSchema.safeParse({ ...payment, ...fields }).success).toBe(false);
    }
    expect(OrderPaymentSchema.parse({ ...payment, status: "unknown" }).status).toBe("unknown");
  });
});
