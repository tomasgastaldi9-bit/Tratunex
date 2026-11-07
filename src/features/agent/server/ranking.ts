import { decidePurchasePolicy, formatPesos } from "../../../contracts/purchases";
import type {
  PolicyCheck,
  PurchasePolicy,
  PurchaseRequest,
  QuoteForRanking,
  QuoteOrigin,
  QuoteRank,
} from "../../../contracts/purchases";

/**
 * BUY-03: ordena las cotizaciones con una regla fija (decisión 18 del README).
 * Además de los 5 descartes de esa decisión, NO califica la cotización que el
 * agente rechazaría pagar según las reglas de pago (proveedor no permitido o
 * total arriba del máximo): no tiene sentido recomendar algo que no se puede pagar.
 * "Pide aprobación" sí califica (se puede comprar con el OK del dueño).
 * El orden lo decide este código, nunca la IA: así nunca "inventa" un ganador.
 * Es puro (sin base ni red): recibe todo, incluida la fecha de hoy, y por eso
 * se puede probar con cualquier caso.
 */

export type RankInput = {
  /** De la compra solo usamos cantidad, presupuesto y fecha pedida. */
  request: Pick<PurchaseRequest, "quantity" | "budget_atomic" | "needed_by">;
  quotes: QuoteForRanking[];
  /** Las reglas de pago de la empresa (null = todavía no cargó reglas). */
  policy: PurchasePolicy | null;
  /** Hoy, "AAAA-MM-DD" en hora de Argentina. Se recibe para que las pruebas no dependan del reloj. */
  today: string;
};

export type RankOutput = { ranking: QuoteRank[]; recommended_quote_id: string | null };

/** Prioridad del origen cuando todo lo demás empata: una llamada real vale más que la web o un ejemplo. */
const ORIGIN_ORDER: Record<QuoteOrigin, number> = { call: 0, web: 1, example: 2 };

/** "1 día" / "5 días". */
function dias(n: number): string {
  return `${n} ${n === 1 ? "día" : "días"}`;
}

/**
 * Días entre dos fechas "AAAA-MM-DD". Usamos UTC a propósito: en UTC no hay
 * cambios de horario, así que la resta da siempre un número entero de días.
 */
function daysBetween(from: string, to: string): number {
  const toUtc = (day: string) => {
    const [y, m, d] = day.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(to) - toUtc(from)) / 86_400_000);
}

/**
 * La fecha de hoy en Argentina como "AAAA-MM-DD". El servidor puede estar en
 * otro huso horario (UTC), y a las 22 h de Buenos Aires en UTC ya es mañana.
 */
export function todayInArgentina(now: Date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Lo que calculamos de cada cotización antes de ordenar. */
type Evaluated = {
  quote: QuoteForRanking;
  /** Precio × cantidad, como BigInt para no perder precisión. null = no dio precio. */
  total: bigint | null;
  /** Qué haría el agente al pagarla (null si no dio precio: no hay monto que revisar). */
  check: PolicyCheck | null;
  /** Motivos por los que NO califica (vacío = califica). */
  problems: string[];
};

/** Revisa una cotización contra la compra y las reglas, y junta TODOS los motivos por los que no sirve. */
function evaluate(quote: QuoteForRanking, request: RankInput["request"], policy: PurchasePolicy | null, today: string): Evaluated {
  const problems: string[] = [];
  const total = quote.unit_price_atomic === null ? null : BigInt(quote.unit_price_atomic) * BigInt(request.quantity);
  // La regla de pago vive en el contrato: acá no se reimplementa.
  const check = total === null ? null : decidePurchasePolicy(policy, total.toString(), quote.supplier_contact_id);

  if (total === null) {
    problems.push("No dio precio en pesos");
  } else if (total > BigInt(request.budget_atomic)) {
    problems.push(`${formatPesos(total.toString())} supera el presupuesto de ${formatPesos(request.budget_atomic)}`);
  }
  if (quote.accepts_argt === "no") {
    problems.push("No acepta cobrar en ARGt");
  }
  if (quote.available_quantity !== null && quote.available_quantity < request.quantity) {
    problems.push(`Tiene ${quote.available_quantity} de ${request.quantity}`);
  }
  if (quote.delivery_days !== null) {
    // Cuántos días faltan para la fecha pedida, contando desde hoy.
    const daysLeft = daysBetween(today, request.needed_by);
    if (quote.delivery_days > daysLeft) {
      problems.push(
        daysLeft < 0
          ? `Entrega en ${dias(quote.delivery_days)} y la fecha que pediste ya pasó`
          : `Entrega en ${dias(quote.delivery_days)} y la necesitás en ${dias(daysLeft)}`,
      );
    }
  }
  // Si el agente rechazaría el pago, no califica; el motivo es el mismo texto de la regla.
  if (check?.decision === "rejected") {
    problems.push(check.reason);
  }
  return { quote, total, check, problems };
}

/**
 * Compara dos cotizaciones que califican: menor total → menor plazo
 * (desconocido al final) → acepta ARGt "yes" antes que "unknown" → origen.
 * Devuelve negativo si `a` va antes.
 */
function compareEligible(a: Evaluated, b: Evaluated): number {
  // Las que califican siempre tienen total (sin precio no califica).
  const ta = a.total ?? BigInt(0);
  const tb = b.total ?? BigInt(0);
  if (ta !== tb) return ta < tb ? -1 : 1;

  const da = a.quote.delivery_days;
  const db = b.quote.delivery_days;
  if (da !== db) {
    if (da === null) return 1;
    if (db === null) return -1;
    return da - db;
  }

  const ya = a.quote.accepts_argt === "yes" ? 0 : 1;
  const yb = b.quote.accepts_argt === "yes" ? 0 : 1;
  if (ya !== yb) return ya - yb;

  return ORIGIN_ORDER[a.quote.origin] - ORIGIN_ORDER[b.quote.origin];
}

/** Motivos cortos y positivos de una que califica, para mostrarle al dueño. */
function positiveReasons(item: Evaluated, lowestTotal: bigint | null): string[] {
  const reasons: string[] = [];
  if (item.total !== null && item.total === lowestTotal) reasons.push("El precio total más bajo");
  if (item.quote.delivery_days !== null) reasons.push(`Entrega en ${dias(item.quote.delivery_days)}`);
  reasons.push(item.quote.accepts_argt === "yes" ? "Acepta ARGt" : "No confirmó si acepta ARGt");
  if (item.quote.origin === "example") reasons.push("Cotización de prueba");
  return reasons;
}

/** Ordena, recomienda la primera que califica y calcula qué haría el agente al pagar cada una. */
export function rankQuotesByRules({ request, quotes, policy, today }: RankInput): RankOutput {
  const evaluated = quotes.map((q) => evaluate(q, request, policy, today));

  // sort es estable: si dos empatan en todo, quedan en el orden en que llegaron.
  const eligible = evaluated.filter((e) => e.problems.length === 0).sort(compareEligible);
  // Las que no califican van al final, en el orden en que llegaron.
  const notEligible = evaluated.filter((e) => e.problems.length > 0);

  const lowestTotal = eligible[0]?.total ?? null;

  const ranking: QuoteRank[] = [
    ...eligible.map((item) => {
      const total = (item.total ?? BigInt(0)).toString();
      return {
        quote_id: item.quote.quote_id,
        supplier_contact_id: item.quote.supplier_contact_id,
        supplier_name: item.quote.supplier_name,
        position: 0,
        eligible: true,
        total_atomic: total,
        reasons: positiveReasons(item, lowestTotal),
        // Las que califican siempre tienen precio, así que siempre hay decisión de pago.
        policy: item.check,
      };
    }),
    ...notEligible.map((item) => ({
      quote_id: item.quote.quote_id,
      supplier_contact_id: item.quote.supplier_contact_id,
      supplier_name: item.quote.supplier_name,
      position: 0,
      eligible: false,
      total_atomic: item.total === null ? null : item.total.toString(),
      reasons: item.problems,
      // Si la descartó la regla de pago, dejamos la decisión para que la pantalla muestre "Rechaza" y por qué.
      policy: item.check?.decision === "rejected" ? item.check : null,
    })),
  ].map((rank, index) => ({ ...rank, position: index + 1 }));

  return { ranking, recommended_quote_id: eligible[0]?.quote.quote_id ?? null };
}
