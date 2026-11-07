import { z } from "zod";
import type { Ctx, Result } from "./common";
import { rankQuotesOutputSchema, type RankQuotes } from "./purchases";

/** ORD-02: lectura de QUO-02 y adaptación al ranking público de BUY-03. */
const id = z.uuid();
const optionalText = z.string().trim().min(1).max(2000).nullable();
export const QuoteAnswerSchema = z.enum(["yes", "no", "unknown"]);

/** La escala siempre viaja con el importe. No se convierte ARS/USD a ARGt aquí. */
export const QuoteMoneySchema = z.object({
  amount_atomic: z.string().regex(/^(0|[1-9]\d{0,77})$/),
  currency: z.enum(["ARS", "USD", "ARGt"]),
  decimals: z.number().int().min(0).max(18),
}).strict().refine(value => value.currency !== "ARGt" || value.decimals === 18, {
  message: "ARGt usa 18 decimales", path: ["decimals"],
});
export type QuoteMoney = z.infer<typeof QuoteMoneySchema>;

const webUrl = z.string().url().max(2048).refine(value => /^https?:\/\//i.test(value));
export const QuoteSourceSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("call"), call_id: id, transport: z.enum(["mock", "web", "phone"]) }).strict(),
  z.object({ kind: z.literal("web"), url: webUrl }).strict(),
  z.object({ kind: z.literal("example"), label: z.string().trim().min(1).max(200) }).strict(),
]);

export const SupplierQuoteSchema = z.object({
  id,
  company_id: id,
  purchase_request_id: id,
  supplier_contact_id: id,
  unit_price: QuoteMoneySchema.nullable(),
  can_supply: z.enum(["yes", "partial", "no", "unknown"]),
  available_quantity: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  minimum_order_quantity: z.number().int().nonnegative().max(1_000_000_000).nullable(),
  lead_time_days: z.number().int().nonnegative().max(365).nullable(),
  lead_time_text: optionalText,
  price_includes_vat: QuoteAnswerSchema,
  delivery_included: QuoteAnswerSchema,
  accepts_argt: QuoteAnswerSchema,
  payment_terms: optionalText,
  notes: optionalText,
  summary: z.string().trim().min(1).max(2000),
  source: QuoteSourceSchema,
  created_at: z.string().datetime(),
}).strict();
export type SupplierQuote = z.infer<typeof SupplierQuoteSchema>;

export const SupplierQuoteListSchema = z.object({ items: z.array(SupplierQuoteSchema).max(100) }).strict();
export type SupplierQuoteList = z.infer<typeof SupplierQuoteListSchema>;

/** BUY-03 owns the ranking, eligibility, reasons and explanation provenance. */
export const QuoteRankingSchema = rankQuotesOutputSchema;
export type QuoteRanking = z.infer<typeof QuoteRankingSchema>;

/** Puertos de lectura; BUY-03 conserva la autoridad sobre el resultado del ranking. */
export type ListSupplierQuotes = (ctx: Ctx, input: { purchase_request_id: string }) => Promise<Result<SupplierQuoteList>>;
export type RankSupplierQuotes = RankQuotes;
