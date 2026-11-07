import type { Result } from "@/contracts/common";
import type { PurchaseRequest } from "@/contracts/purchases";
import type { QuoteMoney, QuoteRanking, SupplierQuote } from "@/contracts/supplier-quotes";
import { QuoteMoneySchema } from "../../contracts/supplier-quotes";

export type QuoteComparisonRow = {
  quote: SupplierQuote;
  supplier: { id: string; name: string; organization: string | null };
};
export type QuoteRecommendation =
  | { status: "ready"; data: QuoteRanking }
  | { status: "pending"; message: string }
  | { status: "error"; error: Extract<Result<never>, { ok: false }>["error"] };
export type QuoteComparison = {
  purchase: PurchaseRequest;
  rows: QuoteComparisonRow[];
  quotes_status: "ready" | "pending";
  recommendation: QuoteRecommendation;
  mode: "persisted" | "example";
};

/** Formato exacto, incluso por encima de Number.MAX_SAFE_INTEGER. */
export function formatQuoteMoney(money: QuoteMoney): string {
  const scale = BigInt(10) ** BigInt(money.decimals);
  const amount = BigInt(money.amount_atomic);
  const integer = (amount / scale).toLocaleString("es-AR");
  const fraction = (amount % scale).toString().padStart(money.decimals, "0").replace(/0+$/, "");
  return `${money.currency} ${integer}${fraction ? `,${fraction}` : ""}`;
}

export function quoteTotal(unitPrice: QuoteMoney, quantity: number): QuoteMoney {
  if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 1_000_000) throw new Error("Cantidad inválida");
  const total = QuoteMoneySchema.safeParse({ ...unitPrice, amount_atomic: (BigInt(unitPrice.amount_atomic) * BigInt(quantity)).toString() });
  if (!total.success) throw new Error("El total supera los límites del importe admitido");
  return total.data;
}
