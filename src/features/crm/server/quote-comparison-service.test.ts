import { describe, expect, it, vi } from "vitest";
import type { Ctx, Result } from "../../../contracts/common";
import type { SupplierDTO } from "../../../contracts/crm";
import type { QuoteRanking, SupplierQuoteList } from "../../../contracts/supplier-quotes";
import { createQuoteComparisonExample } from "../mocks/quote-comparison-example";
import { createQuoteComparisonService } from "./quote-comparison-service";

const ctx: Ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "10000000-0000-4000-8000-000000000002", actor_type: "user" };
const example = createQuoteComparisonExample(ctx.company_id);
const input = { purchase_request_id: example.purchase.id };
function deps() {
  return {
    getPurchaseRequest: vi.fn(async () => ({ ok: true, data: { purchase_request: example.purchase } }) as const),
    getSupplier: vi.fn(async (_ctx: Ctx, { contact_id }: { contact_id: string }): Promise<Result<{ supplier: SupplierDTO }>> => {
      const row = example.rows.find(row => row.supplier.id === contact_id)!;
      return { ok: true, data: { supplier: { ...row.supplier, company_id: ctx.company_id,
        phone_e164: "+12025550100", website: null, source: { kind: "manual", label: "Datos de prueba", url: null },
        do_not_contact: false, created_at: "2026-11-07T12:00:00Z", updated_at: "2026-11-07T12:00:00Z",
        is_supplier: true, collection_wallet: null, wallet_version: 0, wallet_updated_at: null,
      } } };
    }),
    listQuotes: vi.fn(async (): Promise<Result<SupplierQuoteList>> => ({ ok: true, data: { items: example.rows.map(row => structuredClone(row.quote)) } })),
    rankQuotes: vi.fn(async (): Promise<Result<QuoteRanking>> => example.recommendation.status === "ready"
      ? { ok: true, data: structuredClone(example.recommendation.data) }
      : { ok: false, error: { code: "PROVIDER_ERROR", message: "fixture inválido", retryable: false } }),
  };
}

describe("ORD-02 comparación autorizada y dependencias explícitas", () => {
  it("lee la compra real y mantiene pendiente la integración sin fixtures por defecto", async () => {
    const ports = deps();
    const service = createQuoteComparisonService({ getPurchaseRequest: ports.getPurchaseRequest, getSupplier: ports.getSupplier });
    expect(await service(ctx, input)).toMatchObject({ ok: true, data: { purchase: example.purchase, mode: "persisted", rows: [], quotes_status: "pending", recommendation: { status: "pending" } } });
    expect(ports.getPurchaseRequest).toHaveBeenCalledWith(ctx, input);
    expect(ports.getSupplier).not.toHaveBeenCalled();
    expect(ports.rankQuotes).not.toHaveBeenCalled();
  });
  it("valida IDs antes de consultar dependencias", async () => {
    const ports = deps();
    const service = createQuoteComparisonService(ports);
    expect(await service(ctx, { purchase_request_id: "product-vasos" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service({ ...ctx, company_id: "otra" }, input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(ports.getPurchaseRequest).not.toHaveBeenCalled();
  });
  it("respeta compra inexistente y no lee cotizaciones ni proveedores", async () => {
    const ports = deps();
    const getPurchaseRequest = vi.fn(async () => ({ ok: false, error: { code: "NOT_FOUND", message: "No existe", retryable: false } }) as const);
    expect(await createQuoteComparisonService({ ...ports, getPurchaseRequest })(ctx, input)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(ports.listQuotes).not.toHaveBeenCalled();
    expect(ports.getSupplier).not.toHaveBeenCalled();
  });
  it("muestra 3 cotizaciones y solo la recomendación completa del puerto BUY-03", async () => {
    const ports = deps();
    const result = await createQuoteComparisonService(ports)(ctx, input);
    expect(result).toMatchObject({ ok: true, data: { mode: "persisted", quotes_status: "ready", recommendation: { status: "ready" } } });
    if (!result.ok) throw new Error("Falta comparación");
    expect(result.data.rows).toHaveLength(3);
    expect(result.data.rows[0].supplier.name).toBe(example.rows[0].supplier.name);
    expect(ports.rankQuotes).toHaveBeenCalledWith(ctx, input);
    expect(ports.getSupplier).toHaveBeenCalledTimes(3);
  });
  it.each(["company", "purchase", "duplicate"])("rechaza cotizaciones fuera de scope o duplicadas: %s", async kind => {
    const ports = deps();
    const items = example.rows.map(row => structuredClone(row.quote));
    if (kind === "company") items[0].company_id = ctx.actor_id;
    if (kind === "purchase") items[0].purchase_request_id = ctx.actor_id;
    if (kind === "duplicate") items[1].id = items[0].id;
    ports.listQuotes.mockResolvedValue({ ok: true, data: { items } });
    expect(await createQuoteComparisonService(ports)(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(ports.getSupplier).not.toHaveBeenCalled();
    expect(ports.rankQuotes).not.toHaveBeenCalled();
  });
  it("no muestra un proveedor ajeno devuelto por un adaptador", async () => {
    const ports = deps();
    const good = await ports.getSupplier(ctx, { contact_id: example.rows[0].supplier.id });
    if (!good.ok) throw new Error("Falta fixture");
    ports.getSupplier.mockResolvedValue({ ok: true, data: { supplier: { ...good.data.supplier, company_id: ctx.actor_id } } });
    expect(await createQuoteComparisonService(ports)(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
    expect(ports.rankQuotes).not.toHaveBeenCalled();
  });
  it.each(["unknown", "duplicate", "incomplete"])("mantiene la tabla y rechaza ranking inválido: %s", async kind => {
    const ports = deps();
    if (example.recommendation.status !== "ready") throw new Error("Falta ranking fixture");
    const ranking = structuredClone(example.recommendation.data);
    if (kind === "unknown") ranking.recommended_quote_id = ctx.actor_id;
    if (kind === "duplicate") ranking.ranking[1].quote_id = ranking.ranking[0].quote_id;
    if (kind === "incomplete") ranking.ranking.pop();
    ports.rankQuotes.mockResolvedValue({ ok: true, data: ranking });
    const result = await createQuoteComparisonService(ports)(ctx, input);
    expect(result).toMatchObject({ ok: true, data: { recommendation: { status: "error", error: { code: "PROVIDER_ERROR" } } } });
    if (result.ok) expect(result.data.rows).toHaveLength(3);
  });
  it("un error de IA conserva las cotizaciones y su error explícito", async () => {
    const ports = deps();
    ports.rankQuotes.mockRejectedValue(new Error("error interno secreto"));
    const result = await createQuoteComparisonService(ports)(ctx, input);
    expect(result).toMatchObject({ ok: true, data: { recommendation: { status: "error", error: { code: "PROVIDER_UNAVAILABLE" } } } });
    expect(JSON.stringify(result)).not.toContain("secreto");
    if (result.ok) expect(result.data.rows).toHaveLength(3);
  });
  it("sin cotizaciones no consulta IA ni inventa un recomendado", async () => {
    const ports = deps();
    ports.listQuotes.mockResolvedValue({ ok: true, data: { items: [] } });
    expect(await createQuoteComparisonService(ports)(ctx, input)).toMatchObject({ ok: true, data: { rows: [], quotes_status: "ready", recommendation: { status: "pending" } } });
    expect(ports.rankQuotes).not.toHaveBeenCalled();
  });
  it("un fallo leyendo quotes sigue siendo fallo y no se sustituye por ejemplos", async () => {
    const ports = deps();
    ports.listQuotes.mockRejectedValue(new Error("fallo de base"));
    expect(await createQuoteComparisonService(ports)(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(ports.rankQuotes).not.toHaveBeenCalled();
  });
});
