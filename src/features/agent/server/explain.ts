import { z } from "zod";
import { formatPesos, POLICY_DECISION_LABELS, QUOTE_ORIGIN_LABELS } from "../../../contracts/purchases";
import type { PurchaseRequest, QuoteForRanking, QuoteRank } from "../../../contracts/purchases";

/**
 * BUY-03: explica la recomendación en 2-3 frases (decisión 19 del README).
 * La IA (Claude Haiku 5.5) SOLO explica: el ranking ya lo decidió ranking.ts.
 * Si no hay clave, tarda, falla o se niega, armamos el texto con reglas.
 * La IA nunca hace fallar al ranking.
 */

/** Una cotización tal como se la contamos a Claude: sin ids internos. */
export type QuoteSummary = {
  proveedor: string;
  posicion: number;
  califica: boolean;
  /** "$ 90.000" o null si no dio precio. */
  total: string | null;
  plazo_dias: number | null;
  acepta_argt: "sí" | "no" | "sin confirmar";
  origen: string;
  motivos: string[];
  /** Qué haría el agente al pagarla ("Paga solo", "Pide aprobación", "Rechaza") y por qué. */
  pago: { decision: string; motivo: string } | null;
};

/** El resumen que se explica (y lo único que ve Claude). */
export type RankingSummary = {
  compra: { producto: string; cantidad: number; para_cuando: string; presupuesto: string };
  recomendada: QuoteSummary | null;
  /** Hasta las 3 primeras del ranking. */
  primeras: QuoteSummary[];
};

const ACEPTA_ARGT: Record<QuoteForRanking["accepts_argt"], QuoteSummary["acepta_argt"]> = {
  yes: "sí",
  no: "no",
  unknown: "sin confirmar",
};

/**
 * Arma el resumen a partir de la compra, las cotizaciones y el ranking.
 * A propósito NO incluye ids (de cotización, de proveedor ni de la empresa):
 * lo que no hace falta para explicar no sale del servidor.
 */
export function buildRankingSummary(args: {
  request: Pick<PurchaseRequest, "product" | "quantity" | "needed_by" | "budget_atomic">;
  quotes: QuoteForRanking[];
  ranking: QuoteRank[];
  recommended_quote_id: string | null;
}): RankingSummary {
  const toSummary = (rank: QuoteRank): QuoteSummary => {
    // Plazo, ARGt y origen no están en el ranking: los buscamos en la cotización original.
    const quote = args.quotes.find((q) => q.quote_id === rank.quote_id);
    return {
      proveedor: rank.supplier_name,
      posicion: rank.position,
      califica: rank.eligible,
      total: rank.total_atomic === null ? null : formatPesos(rank.total_atomic),
      plazo_dias: quote?.delivery_days ?? null,
      acepta_argt: ACEPTA_ARGT[quote?.accepts_argt ?? "unknown"],
      origen: quote ? QUOTE_ORIGIN_LABELS[quote.origin] : "",
      motivos: rank.reasons,
      pago: rank.policy ? { decision: POLICY_DECISION_LABELS[rank.policy.decision], motivo: rank.policy.reason } : null,
    };
  };

  const recommended = args.ranking.find((r) => r.quote_id === args.recommended_quote_id);
  return {
    compra: {
      producto: args.request.product,
      cantidad: args.request.quantity,
      para_cuando: args.request.needed_by,
      presupuesto: formatPesos(args.request.budget_atomic),
    },
    recomendada: recommended ? toSummary(recommended) : null,
    primeras: args.ranking.slice(0, 3).map(toSummary),
  };
}

/** Pasa la primera letra a minúscula, para meter un motivo en medio de una frase. */
function enMinuscula(texto: string): string {
  return texto.charAt(0).toLowerCase() + texto.slice(1);
}

/** ["a", "b", "c"] → "a, b y c". */
function enumerar(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} y ${items[items.length - 1]}`;
}

/** Explicación de respaldo, armada con reglas (sin IA). Siempre en castellano. */
export function explainByRules(resumen: RankingSummary): string {
  const rec = resumen.recomendada;
  if (rec) {
    const motivos = enumerar(rec.motivos.map(enMinuscula));
    const pago = rec.pago ? ` ${rec.pago.motivo}` : "";
    return `Recomiendo a ${rec.proveedor}: ${motivos}. Total ${rec.total ?? "sin precio"}.${pago}`;
  }
  // Sin recomendada: contamos el motivo principal de la mejor (la primera del ranking).
  const mejor = resumen.primeras[0];
  const motivo = mejor?.motivos[0];
  if (!mejor || !motivo) return "Ninguna cotización sirve para esta compra.";
  // Los motivos de la regla de pago terminan en punto: se lo sacamos para no cerrar la frase dos veces.
  return `Ninguna cotización sirve para esta compra: ${enMinuscula(motivo.replace(/\.$/, ""))} (${mejor.proveedor}).`;
}

const CLAUDE_URL = "https://api.anthropic.com/v1/messages";
const CLAUDE_MODEL = "claude-haiku-5-5";

/** Lo que le pedimos a Claude. Le marcamos límites claros para que no invente datos. */
const SYSTEM_PROMPT = [
  "Sos el agente de compras de una pyme argentina.",
  "Explicale al dueño en 2 o 3 frases, en castellano rioplatense y sin listas, por qué se recomienda esa cotización, qué regla de pago se aplica y si el agente paga solo o pide aprobación.",
  "Usá SOLO los datos del JSON que te paso: no inventes precios, plazos ni proveedores.",
  "Si no hay recomendada, explicá por qué ninguna cotización sirve.",
].join(" ");

/**
 * De la respuesta de Claude solo miramos el motivo de corte y los bloques de
 * contenido. Haiku 5.5 puede mandar bloques "thinking" (razonamiento): no se
 * muestran, por eso después nos quedamos solo con los de tipo "text".
 */
const claudeResponseSchema = z.object({
  stop_reason: z.string().nullable().optional(),
  content: z.array(z.object({ type: z.string(), text: z.string().optional() })),
});

export type ClaudeOptions = {
  apiKey: string;
  /** Se recibe como parámetro para que las pruebas usen uno falso y nunca llamen a la API real. */
  fetchImpl: typeof fetch;
  /** Tiempo máximo de espera: si Claude tarda más, seguimos con la explicación de respaldo. */
  timeoutMs?: number;
};

/**
 * Le pide la explicación a Claude. Devuelve null si algo salió mal (red,
 * error, tiempo, respuesta rara o rechazo): quien llama usa el respaldo.
 */
export async function explainWithClaude(
  resumen: RankingSummary,
  { apiKey, fetchImpl, timeoutMs = 8000 }: ClaudeOptions,
): Promise<{ text: string; source: "ai" } | null> {
  // AbortController corta la llamada si pasa el tiempo máximo.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(CLAUDE_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2026-10-21",
      },
      // Sin temperature/top_p/top_k, sin budget_tokens y sin "prefill" del
      // asistente: Haiku 5.5 los rechaza (error 400).
      body: JSON.stringify({
        model: CLAUDE_MODEL,
        max_tokens: 2000,
        output_config: { effort: "low" },
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: JSON.stringify(resumen) }],
      }),
      signal: controller.signal,
    });
    if (!response.ok) {
      // Solo el status: nunca la clave ni datos de la empresa.
      console.error("[agent] Claude respondió con error", { status: response.status });
      return null;
    }

    const parsed = claudeResponseSchema.safeParse(await response.json());
    if (!parsed.success) {
      console.error("[agent] Claude respondió algo inesperado", { status: response.status });
      return null;
    }
    // Si Claude se negó a responder, no usamos lo que haya mandado.
    if (parsed.data.stop_reason === "refusal") {
      console.error("[agent] Claude rechazó explicar el ranking", { status: response.status });
      return null;
    }

    const text = parsed.data.content
      .filter((block) => block.type === "text" && typeof block.text === "string")
      .map((block) => block.text)
      .join("")
      .trim();
    return text ? { text, source: "ai" } : null;
  } catch (error) {
    // Error de red o tiempo agotado: anotamos solo el tipo de error.
    console.error("[agent] no se pudo llamar a Claude", { code: error instanceof Error ? error.name : "desconocido" });
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * La explicación final: intenta con Claude si hay clave; si no hay clave o
 * Claude no pudo, usa la de reglas. Nunca falla.
 */
export async function explainRanking(
  resumen: RankingSummary,
  opciones: { apiKey?: string; fetchImpl: typeof fetch; timeoutMs?: number },
): Promise<{ text: string; source: "ai" | "rules" }> {
  const apiKey = opciones.apiKey?.trim();
  if (apiKey) {
    const ai = await explainWithClaude(resumen, { apiKey, fetchImpl: opciones.fetchImpl, timeoutMs: opciones.timeoutMs });
    if (ai) return ai;
  }
  return { text: explainByRules(resumen), source: "rules" };
}
