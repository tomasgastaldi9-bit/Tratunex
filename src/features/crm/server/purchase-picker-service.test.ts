import { describe, expect, it, vi } from "vitest";
import type { Ctx } from "../../../contracts/common";
import { createPurchasePickerService } from "./purchase-picker-service";

const ctx: Ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "10000000-0000-4000-8000-000000000002", actor_type: "user" };
const choice = { id: "20000000-0000-4000-8000-000000000001", company_id: ctx.company_id,
  product: "500 vasos", quantity: 500, unit: "unidades", needed_by: "2026-11-09" };
describe("ORD-04: selector de compras sin IDs manuales", () => {
  it("solo entrega la proyección de selección, sin presupuesto ni campos privados", async () => {
    const read = vi.fn(async () => ({ ok: true, data: [{ ...choice, budget_atomic: "999999999999999999999999999999999999", private_field: "hidden" }] }) as const);
    expect(await createPurchasePickerService(read)(ctx)).toEqual({ ok: true, data: { items: [choice], page: 0, has_next: false } });
  });
  it("rechaza resultados de otra empresa sin filtrar ninguna fila", async () => {
    const service = createPurchasePickerService(async () => ({ ok: true, data: [{ ...choice, company_id: ctx.actor_id }] }));
    const result = await service(ctx);
    expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(JSON.stringify(result)).not.toContain("500 vasos");
  });
  it("una página completa anuncia la siguiente sin perder la fila extra", async () => {
    const read = vi.fn(async () => ({ ok: true, data: Array.from({ length: 21 }, (_, index) => ({ ...choice, id: `20000000-0000-4000-8000-${String(index).padStart(12, "0")}` })) }) as const);
    const result = await createPurchasePickerService(read)(ctx, { page: 2 });
    expect(result).toMatchObject({ ok: true, data: { page: 2, has_next: true } });
    if (result.ok) expect(result.data.items).toHaveLength(20);
    expect(read).toHaveBeenCalledWith(ctx, { offset: 40, limit: 21 });
  });
  it("valida página y actor antes de consultar datos", async () => {
    const read = vi.fn(async () => ({ ok: true, data: [] }) as const);
    const service = createPurchasePickerService(read);
    for (const page of [-1, 1001, 0.5]) expect(await service(ctx, { page })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service({ ...ctx, actor_type: "voice" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(read).not.toHaveBeenCalled();
  });
  it("el tope explícito no genera un enlace a una página inválida", async () => {
    const service = createPurchasePickerService(async () => ({ ok: true, data: Array.from({ length: 21 }, () => choice) }));
    expect(await service(ctx, { page: 1000 })).toMatchObject({ ok: true, data: { page: 1000, has_next: false, limit_reached: true } });
  });
  it("vacío, datos mal formados y error de base permanecen distintos", async () => {
    expect(await createPurchasePickerService(async () => ({ ok: true, data: [] }))(ctx)).toMatchObject({ ok: true, data: { items: [], has_next: false } });
    expect(await createPurchasePickerService(async () => ({ ok: true, data: [{ ...choice, quantity: "500" }] }))(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(await createPurchasePickerService(async () => { throw new Error("private SQL detail"); })(ctx)).toEqual({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar la lista de compras.", retryable: true } });
  });
});
