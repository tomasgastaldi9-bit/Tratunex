import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { pesosToAtomic } from "../../../contracts/purchases";
import { createPurchaseService, type PurchaseServiceDeps } from "./purchase-service";

// Espiamos console.error: el servicio anota los errores raros en el log del servidor.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

const company = "11111111-1111-4111-8111-111111111111";
const supplier = "33333333-3333-4333-8333-333333333333";
const otherSupplier = "44444444-4444-4444-8444-444444444444";
const requestId = "55555555-5555-4555-8555-555555555555";
const ctx = { company_id: company, actor_type: "user" as const, actor_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" };
const actionCtx = { ...ctx, action_id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb" };

const requestInput = {
  product: "  Vasos térmicos  ",
  quantity: 500,
  unit: "unidades",
  needed_by: "2026-11-20",
  budget_atomic: pesosToAtomic(100000),
  zone: "CABA",
};
const savedRequest = {
  id: requestId,
  product: "Vasos térmicos",
  quantity: 500,
  unit: "unidades",
  needed_by: "2026-11-20",
  budget_atomic: pesosToAtomic(100000),
  zone: "CABA",
  status: "open" as const,
  created_at: "2026-11-07T12:00:00Z",
  created_by: null,
};
const policy = {
  max_per_purchase_atomic: pesosToAtomic(500000),
  auto_pay_limit_atomic: pesosToAtomic(100000),
  only_allowed_suppliers: false,
  allowed_supplier_ids: [] as string[],
};

type Res = { data: unknown; error: { message?: string; code?: string } | null };

// Cliente falso: from(tabla).select().eq()....maybeSingle() devuelve lo que pidamos por tabla.
// Para rankQuotes: por defecto sin clave de Claude y con un fetch falso, así ninguna prueba llama a la API real.
function fakeClient(opts: { tables?: Record<string, Res>; rpc?: Res; rpcThrows?: boolean; fromThrows?: boolean; deps?: PurchaseServiceDeps }) {
  const eq = vi.fn();
  const selects: Array<[string, string]> = [];
  const rpc = vi.fn(async () => {
    if (opts.rpcThrows) throw new Error("boom");
    return opts.rpc ?? { data: null, error: null };
  });
  const from = vi.fn((table: string) => {
    if (opts.fromThrows) throw new Error("boom");
    const chain = {
      select: (cols: string) => {
        selects.push([table, cols]);
        return chain;
      },
      eq: (col: string, val: unknown) => {
        eq(table, col, val);
        return chain;
      },
      maybeSingle: async () => opts.tables?.[table] ?? { data: null, error: null },
    };
    return chain;
  });
  const deps = opts.deps ?? { getApiKey: () => undefined, fetchImpl: vi.fn() as unknown as typeof fetch };
  const service = createPurchaseService(async () => ({ rpc, from }) as unknown as SupabaseClient, deps);
  return { service, rpc, from, eq, selects };
}

describe("createPurchaseRequest", () => {
  it("rechaza ctx inválido, datos inválidos y actor que no es persona", async () => {
    const { service, rpc } = fakeClient({});
    expect(await service.createPurchaseRequest({ ...actionCtx, company_id: " " }, requestInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.createPurchaseRequest(actionCtx, { ...requestInput, quantity: 0 })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.createPurchaseRequest({ ...actionCtx, actor_type: "voice" }, requestInput)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("llama al rpc con los params exactos (normalizados) y devuelve la salida", async () => {
    const { service, rpc } = fakeClient({ rpc: { data: { purchase_request: savedRequest, created: true }, error: null } });
    const r = await service.createPurchaseRequest(actionCtx, requestInput);
    expect(r).toEqual({ ok: true, data: { purchase_request: savedRequest, created: true } });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("create_purchase_request", {
      p_company_id: company,
      p_action_id: actionCtx.action_id,
      p_request: { ...requestInput, product: "Vasos térmicos" },
    });
  });

  it("traduce FORBIDDEN, CONFLICT y errores desconocidos; la excepción es reintentable", async () => {
    const run = (rpc: Res) => fakeClient({ rpc }).service.createPurchaseRequest(actionCtx, requestInput);
    expect(await run({ data: null, error: { code: "42501" } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await run({ data: null, error: { message: "CONFLICT: x" } })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run({ data: null, error: { message: "raro" } })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    const thrown = await fakeClient({ rpcThrows: true }).service.createPurchaseRequest(actionCtx, requestInput);
    expect(thrown).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
  });

  it("falla si la salida de la base es inesperada", async () => {
    const { service } = fakeClient({ rpc: { data: { created: true }, error: null } });
    expect(await service.createPurchaseRequest(actionCtx, requestInput)).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
});

describe("getPurchaseRequest", () => {
  it("lee por id Y por company_id del ctx, y convierte montos (texto o número) y fecha", async () => {
    // Monto realista (1e23) como texto, tal cual lo manda PostgREST tras el ::text; la fecha con hora se normaliza.
    const row = { ...savedRequest, needed_by: "2026-11-20T00:00:00" };
    const { service, eq, selects } = fakeClient({ tables: { purchase_requests: { data: row, error: null } } });
    const r = await service.getPurchaseRequest(ctx, { purchase_request_id: requestId });
    expect(r).toEqual({ ok: true, data: { purchase_request: savedRequest } });
    expect(selects).toContainEqual(["purchase_requests", expect.stringContaining("budget_atomic::text")]);
    expect(eq).toHaveBeenCalledWith("purchase_requests", "id", requestId);
    expect(eq).toHaveBeenCalledWith("purchase_requests", "company_id", company);
  });

  it("acepta el monto como texto", async () => {
    const { service } = fakeClient({ tables: { purchase_requests: { data: savedRequest, error: null } } });
    expect(await service.getPurchaseRequest(ctx, { purchase_request_id: requestId })).toMatchObject({ ok: true });
  });

  it("un monto que llega como número (1e23) se rechaza, no se redondea", async () => {
    const { service } = fakeClient({ tables: { purchase_requests: { data: { ...savedRequest, budget_atomic: 1e23 }, error: null } } });
    expect(await service.getPurchaseRequest(ctx, { purchase_request_id: requestId })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });

  it("sin fila → NOT_FOUND", async () => {
    const { service } = fakeClient({});
    expect(await service.getPurchaseRequest(ctx, { purchase_request_id: requestId })).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
  });

  it("id inválido → VALIDATION_ERROR sin leer", async () => {
    const { service, from } = fakeClient({});
    expect(await service.getPurchaseRequest(ctx, { purchase_request_id: "x" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("error de lectura → PROVIDER_UNAVAILABLE; monto no seguro → PROVIDER_ERROR", async () => {
    const a = fakeClient({ tables: { purchase_requests: { data: null, error: { message: "x" } } } });
    expect(await a.service.getPurchaseRequest(ctx, { purchase_request_id: requestId })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    const b = fakeClient({ tables: { purchase_requests: { data: { ...savedRequest, budget_atomic: 1e23 }, error: null } } });
    expect(await b.service.getPurchaseRequest(ctx, { purchase_request_id: requestId })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
});

describe("getPurchasePolicy", () => {
  it("sin reglas → policy null; admin puede editar", async () => {
    const { service } = fakeClient({ tables: { company_members: { data: { role: "admin" }, error: null } } });
    expect(await service.getPurchasePolicy(ctx)).toEqual({ ok: true, data: { policy: null, can_edit: true } });
  });

  it("convierte numeric (número o texto) a texto; vendedor no edita", async () => {
    const row = { max_per_purchase_atomic: pesosToAtomic(5000), auto_pay_limit_atomic: pesosToAtomic(1000), only_allowed_suppliers: true, allowed_supplier_ids: [supplier] };
    const { service, eq, selects } = fakeClient({
      tables: { purchase_policies: { data: row, error: null }, company_members: { data: { role: "vendedor" }, error: null } },
    });
    expect(await service.getPurchasePolicy(ctx)).toEqual({
      ok: true,
      data: { policy: { max_per_purchase_atomic: pesosToAtomic(5000), auto_pay_limit_atomic: pesosToAtomic(1000), only_allowed_suppliers: true, allowed_supplier_ids: [supplier] }, can_edit: false },
    });
    expect(eq).toHaveBeenCalledWith("purchase_policies", "company_id", company);
    expect(selects).toContainEqual(["purchase_policies", expect.stringMatching(/max_per_purchase_atomic::text.*auto_pay_limit_atomic::text/)]);
  });

  it("sin membresía → can_edit false", async () => {
    const { service } = fakeClient({});
    expect(await service.getPurchasePolicy(ctx)).toEqual({ ok: true, data: { policy: null, can_edit: false } });
  });

  it("errores de lectura → PROVIDER_UNAVAILABLE", async () => {
    const a = fakeClient({ tables: { purchase_policies: { data: null, error: { message: "x" } } } });
    expect(await a.service.getPurchasePolicy(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    const b = fakeClient({ tables: { company_members: { data: null, error: { message: "x" } } } });
    expect(await b.service.getPurchasePolicy(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    const c = fakeClient({ fromThrows: true });
    expect(await c.service.getPurchasePolicy(ctx)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });
});

describe("savePurchasePolicy", () => {
  it("valida, exige persona y llama al rpc con los params exactos", async () => {
    const { service, rpc } = fakeClient({ rpc: { data: { policy }, error: null } });
    expect(await service.savePurchasePolicy(actionCtx, { policy: { ...policy, auto_pay_limit_atomic: pesosToAtomic(900000) } })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.savePurchasePolicy({ ...actionCtx, actor_type: "system" }, { policy })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(rpc).not.toHaveBeenCalled();

    expect(await service.savePurchasePolicy(actionCtx, { policy })).toEqual({ ok: true, data: { policy } });
    expect(rpc).toHaveBeenCalledWith("save_purchase_policy", { p_company_id: company, p_action_id: actionCtx.action_id, p_policy: policy });
  });

  it("traduce 'unknown supplier', FORBIDDEN, CONFLICT y desconocidos", async () => {
    const run = (rpc: Res) => fakeClient({ rpc }).service.savePurchasePolicy(actionCtx, { policy });
    expect(await run({ data: null, error: { message: "VALIDATION_ERROR: unknown supplier" } })).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Uno de los proveedores elegidos no es de tu empresa. Recargá la página.", retryable: false },
    });
    expect(await run({ data: null, error: { code: "42501" } })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await run({ data: null, error: { message: "CONFLICT: x" } })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(await run({ data: null, error: { message: "raro" } })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(await fakeClient({ rpcThrows: true }).service.savePurchasePolicy(actionCtx, { policy })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    expect(await run({ data: { nope: 1 }, error: null })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });
});

describe("checkPurchasePolicy", () => {
  // Reglas como las manda PostgREST tras el ::text: montos en unidades mínimas reales, como texto.
  const real = (over: object = {}) => ({
    tables: {
      purchase_policies: {
        data: {
          max_per_purchase_atomic: pesosToAtomic(500000),
          auto_pay_limit_atomic: pesosToAtomic(100000),
          only_allowed_suppliers: false,
          allowed_supplier_ids: [],
          ...over,
        },
        error: null,
      },
    } as Record<string, Res>,
  });

  it("sin reglas → needs_approval", async () => {
    const { service } = fakeClient({});
    const r = await service.checkPurchasePolicy(ctx, { amount_atomic: pesosToAtomic(10), supplier_contact_id: supplier });
    expect(r).toMatchObject({ ok: true, data: { decision: "needs_approval" } });
  });

  it("auto_pay, needs_approval y rejected (monto y proveedor)", async () => {
    const check = (amount: number, over: object = {}, sup = supplier) =>
      fakeClient(real(over)).service.checkPurchasePolicy(ctx, { amount_atomic: pesosToAtomic(amount), supplier_contact_id: sup });
    expect(await check(50000)).toMatchObject({ ok: true, data: { decision: "auto_pay" } });
    expect(await check(200000)).toMatchObject({ ok: true, data: { decision: "needs_approval" } });
    expect(await check(600000)).toMatchObject({ ok: true, data: { decision: "rejected" } });
    const only = { only_allowed_suppliers: true, allowed_supplier_ids: [supplier] };
    expect(await check(50000, only, otherSupplier)).toMatchObject({ ok: true, data: { decision: "rejected" } });
    expect(await check(50000, only, supplier)).toMatchObject({ ok: true, data: { decision: "auto_pay" } });
  });

  it("valida la entrada sin leer la base", async () => {
    const { service, from } = fakeClient({});
    expect(await service.checkPurchasePolicy(ctx, { amount_atomic: "0", supplier_contact_id: supplier })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.checkPurchasePolicy(ctx, { amount_atomic: "1.5", supplier_contact_id: supplier })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("un error de lectura NUNCA devuelve auto_pay", async () => {
    const input = { amount_atomic: pesosToAtomic(1), supplier_contact_id: supplier };
    const bad: Array<Parameters<typeof fakeClient>[0]> = [
      { tables: { purchase_policies: { data: null, error: { message: "x" } } } },
      { fromThrows: true },
      // Una fila ilegible tampoco puede terminar en "paga solo".
      { tables: { purchase_policies: { data: { max_per_purchase_atomic: 1e30, auto_pay_limit_atomic: "1", only_allowed_suppliers: false, allowed_supplier_ids: [] }, error: null } } },
    ];
    for (const opts of bad) {
      const r = await fakeClient(opts).service.checkPurchasePolicy(ctx, input);
      expect(r).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    }
  });
});

describe("rankQuotes", () => {
  // Plazo desconocido a propósito: así la prueba no depende de la fecha de hoy.
  const quote = (over: object = {}) => ({
    quote_id: "q-sirve",
    supplier_contact_id: supplier,
    supplier_name: "Descartables Sur",
    unit_price_atomic: pesosToAtomic(180),
    available_quantity: 1000,
    delivery_days: null,
    accepts_argt: "yes" as const,
    origin: "call" as const,
    ...over,
  });
  const input = {
    purchase_request_id: requestId,
    quotes: [quote({ quote_id: "q-sin-stock", supplier_contact_id: otherSupplier, unit_price_atomic: pesosToAtomic(150), available_quantity: 10 }), quote()],
  };
  const tables = (over: Record<string, Res> = {}) => ({
    purchase_requests: { data: savedRequest, error: null },
    purchase_policies: { data: policy, error: null },
    ...over,
  });

  it("valida la entrada sin leer la base", async () => {
    const { service, from } = fakeClient({});
    expect(await service.rankQuotes(ctx, { ...input, quotes: [] })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(await service.rankQuotes({ ...ctx, company_id: " " }, input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("la compra no existe (o es de otra empresa) → NOT_FOUND", async () => {
    const { service, eq } = fakeClient({});
    expect(await service.rankQuotes(ctx, input)).toMatchObject({ ok: false, error: { code: "NOT_FOUND" } });
    expect(eq).toHaveBeenCalledWith("purchase_requests", "company_id", company);
  });

  it("si no se pueden leer las reglas → PROVIDER_UNAVAILABLE", async () => {
    const a = fakeClient({ tables: tables({ purchase_policies: { data: null, error: { message: "x" } } }) });
    expect(await a.service.rankQuotes(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    const b = fakeClient({ tables: tables({ purchase_policies: { data: { ...policy, max_per_purchase_atomic: 1e30 }, error: null } }) });
    expect(await b.service.rankQuotes(ctx, input)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });

  it("éxito sin clave de Claude: ranking + explicación de reglas, sin llamar a fetch", async () => {
    const fetchImpl = vi.fn();
    const { service, eq } = fakeClient({ tables: tables(), deps: { getApiKey: () => undefined, fetchImpl: fetchImpl as unknown as typeof fetch } });
    const r = await service.rankQuotes(ctx, input);
    expect(r).toMatchObject({
      ok: true,
      data: {
        recommended_quote_id: "q-sirve",
        explanation_source: "rules",
        ranking: [
          { quote_id: "q-sirve", position: 1, eligible: true, total_atomic: pesosToAtomic(90000), policy: { decision: "auto_pay" } },
          { quote_id: "q-sin-stock", position: 2, eligible: false, reasons: ["Tiene 10 de 500"], policy: null },
        ],
      },
    });
    if (r.ok) expect(r.data.explanation).toMatch(/^Recomiendo a Descartables Sur: /);
    expect(fetchImpl).not.toHaveBeenCalled();
    expect(eq).toHaveBeenCalledWith("purchase_policies", "company_id", company);
  });

  it("con clave usa la explicación de Claude (fuente ai)", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Conviene Descartables Sur." }] })));
    const { service } = fakeClient({ tables: tables(), deps: { getApiKey: () => "k", fetchImpl: fetchImpl as unknown as typeof fetch } });
    expect(await service.rankQuotes(ctx, input)).toMatchObject({ ok: true, data: { explanation: "Conviene Descartables Sur.", explanation_source: "ai" } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
