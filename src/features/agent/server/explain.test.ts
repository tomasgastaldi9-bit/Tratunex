import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { pesosToAtomic } from "../../../contracts/purchases";
import type { PurchasePolicy, QuoteForRanking } from "../../../contracts/purchases";
import { buildRankingSummary, explainByRules, explainRanking, explainWithClaude } from "./explain";
import { rankQuotesByRules } from "./ranking";

// Espiamos console.error: los fallos de Claude se anotan en el log del servidor.
let consoleError: MockInstance<typeof console.error>;
beforeEach(() => {
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => {
  consoleError.mockRestore();
});

const request = { product: "Vasos térmicos", quantity: 500, needed_by: "2026-11-20", budget_atomic: pesosToAtomic(100000) };
const policy: PurchasePolicy = {
  max_per_purchase_atomic: pesosToAtomic(500000),
  auto_pay_limit_atomic: pesosToAtomic(100000),
  only_allowed_suppliers: false,
  allowed_supplier_ids: [],
};
const quotes: QuoteForRanking[] = [
  { quote_id: "q-barata", supplier_contact_id: "33333333-3333-4333-8333-333333333333", supplier_name: "Vasos Baratos", unit_price_atomic: pesosToAtomic(150), available_quantity: 300, delivery_days: 2, accepts_argt: "yes", origin: "call" },
  { quote_id: "q-sirve", supplier_contact_id: "44444444-4444-4444-8444-444444444444", supplier_name: "Descartables Sur", unit_price_atomic: pesosToAtomic(180), available_quantity: 1000, delivery_days: 5, accepts_argt: "yes", origin: "web" },
];

function summaryFor(qs: QuoteForRanking[]) {
  const { ranking, recommended_quote_id } = rankQuotesByRules({ request, quotes: qs, policy, today: "2026-11-07" });
  return buildRankingSummary({ request, quotes: qs, ranking, recommended_quote_id });
}
const resumen = summaryFor(quotes);

/** Respuesta falsa de la API de Claude. */
function claudeResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

describe("buildRankingSummary", () => {
  it("lleva la compra y las primeras con montos en pesos, sin ids internos", () => {
    expect(resumen.compra).toEqual({ producto: "Vasos térmicos", cantidad: 500, para_cuando: "2026-11-20", presupuesto: "$ 100.000" });
    expect(resumen.recomendada).toMatchObject({ proveedor: "Descartables Sur", total: "$ 90.000", plazo_dias: 5, acepta_argt: "sí", origen: "Web", pago: { decision: "Paga solo" } });
    expect(resumen.primeras.map((q) => q.proveedor)).toEqual(["Descartables Sur", "Vasos Baratos"]);
    const json = JSON.stringify(resumen);
    for (const id of ["q-barata", "q-sirve", quotes[0]!.supplier_contact_id, quotes[1]!.supplier_contact_id]) {
      expect(json).not.toContain(id);
    }
  });

  it("como máximo 3 primeras", () => {
    const many = [1, 2, 3, 4].map((i) => ({ ...quotes[1]!, quote_id: `q${i}` }));
    expect(summaryFor(many).primeras).toHaveLength(3);
  });
});

describe("explainByRules", () => {
  it("con recomendada: motivos, total y la regla de pago", () => {
    expect(explainByRules(resumen)).toBe(
      "Recomiendo a Descartables Sur: el precio total más bajo, entrega en 5 días y acepta ARGt. Total $ 90.000. $ 90.000 está dentro de las reglas: hasta $ 100.000 el agente paga solo.",
    );
  });

  it("sin recomendada: el motivo principal de la mejor", () => {
    expect(explainByRules(summaryFor([quotes[0]!]))).toBe("Ninguna cotización sirve para esta compra: tiene 300 de 500 (Vasos Baratos).");
  });
});

describe("explainWithClaude / explainRanking", () => {
  it("éxito: manda headers y body correctos y toma solo los bloques de texto", async () => {
    const fetchImpl = vi.fn<typeof fetch>(async () =>
      claudeResponse({
        stop_reason: "end_turn",
        content: [
          { type: "thinking", thinking: "pienso...", signature: "x" },
          { type: "text", text: "Te recomiendo Descartables Sur. " },
          { type: "text", text: "Paga solo." },
        ],
      }),
    );
    const r = await explainRanking(resumen, { apiKey: "clave-de-prueba", fetchImpl });
    expect(r).toEqual({ text: "Te recomiendo Descartables Sur. Paga solo.", source: "ai" });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(url).toBe("https://api.anthropic.com/v1/messages");
    expect(init?.method).toBe("POST");
    expect(init?.headers).toEqual({ "content-type": "application/json", "x-api-key": "clave-de-prueba", "anthropic-version": "2026-10-21" });
    expect(init?.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["max_tokens", "messages", "model", "output_config", "system"]);
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 2000, output_config: { effort: "low" } });
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("thinking");
    expect(String(body.system)).toContain("castellano rioplatense");
    // Un solo mensaje del usuario (sin prefill del asistente) con el resumen en JSON.
    expect(body.messages).toEqual([{ role: "user", content: JSON.stringify(resumen) }]);
  });

  it("refusal → usa las reglas", async () => {
    const fetchImpl = vi.fn(async () => claudeResponse({ stop_reason: "refusal", content: [{ type: "text", text: "No." }] }));
    const r = await explainRanking(resumen, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r).toEqual({ text: explainByRules(resumen), source: "rules" });
  });

  it("error 500 → usa las reglas y anota solo el status", async () => {
    const fetchImpl = vi.fn(async () => claudeResponse({ error: { message: "boom" } }, 500));
    const r = await explainRanking(resumen, { apiKey: "clave-secreta", fetchImpl: fetchImpl as unknown as typeof fetch });
    expect(r.source).toBe("rules");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[agent]"), { status: 500 });
    expect(JSON.stringify(consoleError.mock.calls)).not.toContain("clave-secreta");
  });

  it("JSON raro o sin texto → null", async () => {
    const raro = vi.fn(async () => claudeResponse({ hola: 1 }));
    expect(await explainWithClaude(resumen, { apiKey: "k", fetchImpl: raro as unknown as typeof fetch })).toBeNull();
    const soloThinking = vi.fn(async () => claudeResponse({ stop_reason: "end_turn", content: [{ type: "thinking", thinking: "..." }] }));
    expect(await explainWithClaude(resumen, { apiKey: "k", fetchImpl: soloThinking as unknown as typeof fetch })).toBeNull();
  });

  it("timeout → corta la llamada y usa las reglas", async () => {
    // Un fetch que nunca responde, salvo que lo corten con el AbortController.
    const fetchImpl = vi.fn(
      (_url: unknown, init?: RequestInit) =>
        new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => reject(new DOMException("cortado", "AbortError")));
        }),
    );
    const r = await explainRanking(resumen, { apiKey: "k", fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 10 });
    expect(r.source).toBe("rules");
    expect(consoleError).toHaveBeenCalledWith(expect.stringContaining("[agent]"), { code: "AbortError" });
  });

  it("sin clave → reglas sin llamar a fetch", async () => {
    const fetchImpl = vi.fn();
    expect(await explainRanking(resumen, { apiKey: undefined, fetchImpl: fetchImpl as unknown as typeof fetch })).toEqual({ text: explainByRules(resumen), source: "rules" });
    expect(await explainRanking(resumen, { apiKey: "  ", fetchImpl: fetchImpl as unknown as typeof fetch })).toMatchObject({ source: "rules" });
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
