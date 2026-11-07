import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { comparatorRankingSchema, pesosToAtomic, RULES_EXPLANATION_PREFIX } from "../../../contracts/purchases";
import type { ComparatorQuote } from "../../voice/server/quote-import";
import { createPurchaseService, type GetContactDep, type ListSupplierQuotesDep, type PurchaseServiceDeps } from "./purchase-service";

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

// ---------------------------------------------------------------------------
// BUY-03 (2): rankQuotes lee las cotizaciones de supplier_quotes y el puerto
// rankSupplierQuotes para el comparador de Nano. Voz y CRM son falsos.
// ---------------------------------------------------------------------------

// Una cotización como la entrega listSupplierQuotes de Voz (precio en centavos de pesos).
function storedQuote(over: Partial<ComparatorQuote> = {}): ComparatorQuote {
  return {
    id: "q-sirve",
    company_id: company,
    purchase_request_id: requestId,
    supplier_contact_id: supplier,
    // 18000 centavos = 180 pesos por unidad → 500 × 180 = $ 90.000 (dentro del presupuesto).
    unit_price: { amount_atomic: "18000", currency: "ARS", decimals: 2 },
    can_supply: "yes",
    available_quantity: 1000,
    minimum_order_quantity: null,
    // Plazo desconocido a propósito: así la prueba no depende de la fecha de hoy.
    lead_time_days: null,
    lead_time_text: null,
    price_includes_vat: "unknown",
    delivery_included: "unknown",
    accepts_argt: "yes",
    payment_terms: null,
    notes: null,
    summary: "Cotización de prueba.",
    source: { kind: "call", call_id: "77777777-7777-4777-8777-777777777777", transport: "web" },
    created_at: "2026-11-07T12:00:00Z",
    ...over,
  };
}

// Tres cotizaciones: la que sirve, una que no puede entregar (otro proveedor) y una en dólares (mismo proveedor).
const storedQuotes = [
  storedQuote(),
  storedQuote({ id: "q-no-puede", supplier_contact_id: otherSupplier, unit_price: { amount_atomic: "15000", currency: "ARS", decimals: 2 }, can_supply: "no" }),
  storedQuote({ id: "q-dolares", unit_price: { amount_atomic: "15000", currency: "USD", decimals: 2 } }),
];

const contactNames: Record<string, { name: string; organization: string | null }> = {
  [supplier]: { name: "Ana", organization: "Descartables Sur" },
  [otherSupplier]: { name: "Beto Pérez", organization: null },
};

/** Arma el servicio con Voz y CRM falsos (y sin clave de Claude, salvo que se pida). */
function quotesService(opts: { list?: ListSupplierQuotesDep; contact?: GetContactDep; apiKey?: string; fetchImpl?: typeof fetch } = {}) {
  const listSupplierQuotes = vi.fn<ListSupplierQuotesDep>(opts.list ?? (async () => ({ ok: true, data: { items: storedQuotes } })));
  const getContact = vi.fn<GetContactDep>(
    opts.contact ??
      (async (_ctx, { contact_id }) =>
        contactNames[contact_id]
          ? { ok: true, data: { contact: contactNames[contact_id] } }
          : { ok: false, error: { code: "NOT_FOUND", message: "No existe", retryable: false } }),
  );
  const client = fakeClient({
    tables: { purchase_requests: { data: savedRequest, error: null }, purchase_policies: { data: policy, error: null } },
    deps: {
      getApiKey: () => opts.apiKey,
      fetchImpl: opts.fetchImpl ?? (vi.fn() as unknown as typeof fetch),
      listSupplierQuotes,
      getContact,
    },
  });
  return { ...client, listSupplierQuotes, getContact };
}

describe("rankQuotes sin quotes (lee supplier_quotes)", () => {
  it("lee las cotizaciones de la compra en Voz y el nombre de cada proveedor en el CRM", async () => {
    const { service, listSupplierQuotes, getContact } = quotesService();
    const r = await service.rankQuotes(ctx, { purchase_request_id: requestId });

    expect(listSupplierQuotes).toHaveBeenCalledWith(ctx, { purchase_request_id: requestId });
    // Un pedido por proveedor distinto (dos cotizaciones son del mismo).
    expect(getContact).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({
      ok: true,
      data: {
        recommended_quote_id: "q-sirve",
        ranking: [
          // Organización si tiene; si no, el nombre del contacto.
          { quote_id: "q-sirve", supplier_name: "Descartables Sur", eligible: true, total_atomic: pesosToAtomic(90000), policy: { decision: "auto_pay" } },
          { quote_id: "q-no-puede", supplier_name: "Beto Pérez", eligible: false, reasons: ["Tiene 0 de 500"] },
          { quote_id: "q-dolares", supplier_name: "Descartables Sur", eligible: false, total_atomic: null, reasons: ["No dio precio en pesos"] },
        ],
      },
    });
  });

  it("si el CRM falla (error o excepción), usa \"Proveedor sin nombre\" y el ranking sigue", async () => {
    const conError = quotesService({ contact: async () => ({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "x", retryable: true } }) });
    const a = await conError.service.rankQuotes(ctx, { purchase_request_id: requestId });
    expect(a.ok).toBe(true);
    if (a.ok) expect(a.data.ranking.map((q) => q.supplier_name)).toEqual(["Proveedor sin nombre", "Proveedor sin nombre", "Proveedor sin nombre"]);

    const conExcepcion = quotesService({
      contact: async () => {
        throw new Error("boom");
      },
    });
    const b = await conExcepcion.service.rankQuotes(ctx, { purchase_request_id: requestId });
    expect(b).toMatchObject({ ok: true, data: { recommended_quote_id: "q-sirve" } });
    if (b.ok) expect(new Set(b.data.ranking.map((q) => q.supplier_name))).toEqual(new Set(["Proveedor sin nombre"]));
  });

  it("sin cotizaciones guardadas → NOT_FOUND", async () => {
    const { service } = quotesService({ list: async () => ({ ok: true, data: { items: [] } }) });
    expect(await service.rankQuotes(ctx, { purchase_request_id: requestId })).toEqual({
      ok: false,
      error: { code: "NOT_FOUND", message: "Todavía no hay cotizaciones para esta compra.", retryable: false },
    });
  });

  it("más de 20 cotizaciones → VALIDATION_ERROR (no se recorta en silencio)", async () => {
    const items = Array.from({ length: 21 }, (_, i) => storedQuote({ id: `q-${i}` }));
    const { service, getContact } = quotesService({ list: async () => ({ ok: true, data: { items } }) });
    expect(await service.rankQuotes(ctx, { purchase_request_id: requestId })).toEqual({
      ok: false,
      error: { code: "VALIDATION_ERROR", message: "Hay más de 20 cotizaciones; filtrá antes de comparar.", retryable: false },
    });
    expect(getContact).not.toHaveBeenCalled();
  });

  it("si Voz devuelve un error, rankQuotes devuelve el mismo error", async () => {
    const vozError = { ok: false as const, error: { code: "PROVIDER_UNAVAILABLE" as const, message: "Voz no respondió", retryable: true } };
    const { service } = quotesService({ list: async () => vozError });
    expect(await service.rankQuotes(ctx, { purchase_request_id: requestId })).toEqual(vozError);
  });

  it("si le pasan quotes, no lee Voz ni el CRM (como antes)", async () => {
    const { service, listSupplierQuotes, getContact } = quotesService();
    const quotes = [{ quote_id: "q-1", supplier_contact_id: supplier, supplier_name: "Descartables Sur", unit_price_atomic: pesosToAtomic(180), available_quantity: null, delivery_days: null, accepts_argt: "yes" as const, origin: "web" as const }];
    expect(await service.rankQuotes(ctx, { purchase_request_id: requestId, quotes })).toMatchObject({ ok: true, data: { recommended_quote_id: "q-1" } });
    expect(listSupplierQuotes).not.toHaveBeenCalled();
    expect(getContact).not.toHaveBeenCalled();
  });
});

describe("rankSupplierQuotes (puerto del comparador)", () => {
  it("devuelve la forma estricta del comparador, con el prefijo \"sin IA\" si explicaron las reglas", async () => {
    const { service } = quotesService();
    const r = await service.rankSupplierQuotes(ctx, { purchase_request_id: requestId });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    expect(r.data.ranking).toEqual([
      { quote_id: "q-sirve", reason: "El precio total más bajo · Acepta ARGt · Paga solo" },
      { quote_id: "q-no-puede", reason: "No califica: Tiene 0 de 500" },
      { quote_id: "q-dolares", reason: "No califica: No dio precio en pesos" },
    ]);
    expect(r.data.recommended_quote_id).toBe("q-sirve");
    expect(r.data.explanation.startsWith(RULES_EXPLANATION_PREFIX)).toBe(true);
    // Exactamente las claves que valida el comparador (estricto: ni una de más).
    expect(Object.keys(r.data).sort()).toEqual(["explanation", "ranking", "recommended_quote_id"]);
    expect(comparatorRankingSchema.safeParse(r.data).success).toBe(true);
  });

  it("si la explicación la escribió la IA, va tal cual (sin prefijo)", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ stop_reason: "end_turn", content: [{ type: "text", text: "Conviene Descartables Sur." }] })));
    const { service } = quotesService({ apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(await service.rankSupplierQuotes(ctx, { purchase_request_id: requestId })).toMatchObject({
      ok: true,
      data: { recommended_quote_id: "q-sirve", explanation: "Conviene Descartables Sur." },
    });
  });

  it("si ninguna sirve → NOT_FOUND con la explicación como mensaje", async () => {
    const items = [storedQuote({ can_supply: "no" })];
    const { service } = quotesService({ list: async () => ({ ok: true, data: { items } }) });
    const ranked = await service.rankQuotes(ctx, { purchase_request_id: requestId });
    expect(ranked).toMatchObject({ ok: true, data: { recommended_quote_id: null } });
    const r = await service.rankSupplierQuotes(ctx, { purchase_request_id: requestId });
    expect(r).toMatchObject({ ok: false, error: { code: "NOT_FOUND", retryable: false } });
    if (!r.ok && ranked.ok) expect(r.error.message).toBe(ranked.data.explanation);
  });

  it("si rankQuotes falla, devuelve el mismo error", async () => {
    const vozError = { ok: false as const, error: { code: "PROVIDER_UNAVAILABLE" as const, message: "Voz no respondió", retryable: true } };
    const { service } = quotesService({ list: async () => vozError });
    expect(await service.rankSupplierQuotes(ctx, { purchase_request_id: requestId })).toEqual(vozError);
    // Una compra inválida también llega como el error de rankQuotes.
    expect(await service.rankSupplierQuotes(ctx, { purchase_request_id: "no-es-uuid" })).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
  });
});
