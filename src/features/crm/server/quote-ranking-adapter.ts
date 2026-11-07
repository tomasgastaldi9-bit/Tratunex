import {
  RANK_QUOTES_MAX, rankQuotesInputSchema, type RankQuotesInput,
} from "../../../contracts/purchases";
import type { Result } from "../../../contracts/common";
import type { QuoteMoney, QuoteRanking } from "../../../contracts/supplier-quotes";
import type { QuoteComparisonRow } from "../quote-comparison";
import { crmFailure } from "./persistent-crm";

/** Same nominal ARS convention as BUY-01 pesosToAtomic; USD has no agreed FX. */
export function quotePriceForRanking(price: QuoteMoney | null): string | null {
  if (price === null || price.currency === "USD") return null;
  return (BigInt(price.amount_atomic) * BigInt(10) ** BigInt(18 - price.decimals)).toString();
}

function rankingSupplierLabel(name: string): string {
  if (name.length <= 120) return name;
  return `${name.slice(0, 119).replace(/[\uD800-\uDBFF]$/, "")}…`;
}

export function prepareQuoteRankingInput(purchase_request_id: string, rows: QuoteComparisonRow[]): Result<RankQuotesInput> {
  if (rows.length > RANK_QUOTES_MAX) return crmFailure("VALIDATION_ERROR",
    `El ranking admite hasta ${RANK_QUOTES_MAX} cotizaciones por compra. No se evaluó una selección parcial.`);
  const input = rankQuotesInputSchema.safeParse({ purchase_request_id, quotes: rows.map(({ quote, supplier }) => ({
    quote_id: quote.id, supplier_contact_id: quote.supplier_contact_id, supplier_name: rankingSupplierLabel(supplier.name),
    unit_price_atomic: quotePriceForRanking(quote.unit_price), available_quantity: quote.available_quantity,
    delivery_days: quote.lead_time_days, accepts_argt: quote.accepts_argt, origin: quote.source.kind,
  })) });
  return input.success ? { ok: true, data: input.data }
    : crmFailure("PROVIDER_ERROR", "Las cotizaciones no son compatibles con el contrato de ranking de compras.");
}

/** Validate identities and arithmetic against exactly the collection sent to BUY-03. */
export function rankingMatchesComparison(ranking: QuoteRanking, input: RankQuotesInput, rows: QuoteComparisonRow[], quantity: number): boolean {
  if (ranking.ranking.length !== rows.length) return false;
  const sources = new Map(rows.map(row => [row.quote.id, row]));
  const sent = new Map(input.quotes.map(quote => [quote.quote_id, quote]));
  const ranked = new Set<string>();
  const positions = new Set<number>();
  for (const item of ranking.ranking) {
    const source = sources.get(item.quote_id);
    const quote = sent.get(item.quote_id);
    if (!source || !quote || ranked.has(item.quote_id) || positions.has(item.position)
      || item.position < 1 || item.position > rows.length
      || item.supplier_contact_id !== quote.supplier_contact_id || item.supplier_name !== quote.supplier_name) return false;
    const total = quote.unit_price_atomic === null ? null : BigInt(quote.unit_price_atomic) * BigInt(quantity);
    if ((total === null) !== (item.total_atomic === null)
      || (total !== null && item.total_atomic !== null && BigInt(item.total_atomic) !== total)) return false;
    if (item.eligible && (total === null || source.quote.can_supply === "no" || item.policy?.decision === "rejected")) return false;
    ranked.add(item.quote_id); positions.add(item.position);
  }
  const firstEligible = [...ranking.ranking].sort((a, b) => a.position - b.position).find(item => item.eligible);
  return ranking.recommended_quote_id === (firstEligible?.quote_id ?? null);
}
