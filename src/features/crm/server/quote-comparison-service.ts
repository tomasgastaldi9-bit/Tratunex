import { z } from "zod";
import { ctxSchema, resultSchema, type Ctx, type Result } from "../../../contracts/common";
import { SupplierDataSchema, type SupplierDTO } from "../../../contracts/crm";
import { purchaseRequestSchema, type GetPurchaseRequest } from "../../../contracts/purchases";
import {
  QuoteRankingSchema, SupplierQuoteListSchema,
  type ListSupplierQuotes, type RankSupplierQuotes,
} from "../../../contracts/supplier-quotes";
import type { QuoteComparison, QuoteRecommendation } from "../quote-comparison";
import { crmFailure } from "./persistent-crm";

type Dependencies = {
  getPurchaseRequest: GetPurchaseRequest;
  getSupplier: (ctx: Ctx, input: { contact_id: string }) => Promise<Result<{ supplier: SupplierDTO }>>;
  listQuotes?: ListSupplierQuotes;
  rankQuotes?: RankSupplierQuotes;
};
const identity = ctxSchema.extend({ company_id: z.uuid(), actor_id: z.uuid() });
const inputSchema = z.object({ purchase_request_id: z.uuid() }).strict();

/** Lectura sin efectos: no llama proveedores, no crea órdenes y no ejecuta pagos. */
export function createQuoteComparisonService(deps: Dependencies) {
  return async (ctx: Ctx, input: { purchase_request_id: string }): Promise<Result<QuoteComparison>> => {
    if (!identity.safeParse(ctx).success || !inputSchema.safeParse(input).success) {
      return crmFailure("VALIDATION_ERROR", "Revisá el identificador de la compra y la empresa activa.");
    }
    try {
      const purchaseResult = resultSchema(z.object({ purchase_request: purchaseRequestSchema })).safeParse(
        await deps.getPurchaseRequest(ctx, input),
      );
      if (!purchaseResult.success) return crmFailure("PROVIDER_ERROR", "La compra devolvió datos incompatibles.");
      if (!purchaseResult.data.ok) return purchaseResult.data;
      const purchase = purchaseResult.data.data.purchase_request;
      if (purchase.id !== input.purchase_request_id) return crmFailure("PROVIDER_ERROR", "La compra recibida no corresponde a la solicitada.");

      if (!deps.listQuotes) return { ok: true, data: {
        purchase, rows: [], quotes_status: "pending", mode: "persisted",
        recommendation: { status: "pending", message: "La integración de cotizaciones todavía no está disponible." },
      } };
      const quoteResult = resultSchema(SupplierQuoteListSchema).safeParse(await deps.listQuotes(ctx, input));
      if (!quoteResult.success) return crmFailure("PROVIDER_ERROR", "Las cotizaciones devolvieron datos incompatibles.");
      if (!quoteResult.data.ok) return quoteResult.data;
      const quotes = quoteResult.data.data.items;
      const ids = new Set(quotes.map(quote => quote.id));
      if (ids.size !== quotes.length || quotes.some(quote => quote.company_id !== ctx.company_id || quote.purchase_request_id !== purchase.id)) {
        return crmFailure("PROVIDER_ERROR", "Las cotizaciones no corresponden a la compra de la empresa activa.");
      }
      const supplierIds = [...new Set(quotes.map(quote => quote.supplier_contact_id))];
      const suppliers = new Map<string, SupplierDTO>();
      for (const contact_id of supplierIds) {
        const response = resultSchema(SupplierDataSchema).safeParse(await deps.getSupplier(ctx, { contact_id }));
        if (!response.success) return crmFailure("PROVIDER_ERROR", "Un proveedor devolvió datos incompatibles.");
        if (!response.data.ok) return response.data;
        const supplier = response.data.data.supplier;
        if (supplier.company_id !== ctx.company_id || supplier.id !== contact_id) return crmFailure("PROVIDER_ERROR", "El proveedor no pertenece a la empresa activa.");
        suppliers.set(contact_id, supplier);
      }
      let recommendation: QuoteRecommendation = { status: "pending", message: quotes.length
        ? "La recomendación del agente todavía no está disponible."
        : "Todavía no hay cotizaciones para recomendar un proveedor." };
      if (quotes.length && deps.rankQuotes) {
        try {
          const result = resultSchema(QuoteRankingSchema).safeParse(await deps.rankQuotes(ctx, input));
          if (!result.success) recommendation = { status: "error", error: {
            code: "PROVIDER_ERROR", message: "El agente devolvió una recomendación incompatible.", retryable: false,
          } };
          else if (!result.data.ok) recommendation = { status: "error", error: result.data.error };
          else {
            const ranking = result.data.data;
            const rankedIds = ranking.ranking.map(item => item.quote_id);
            const complete = rankedIds.length === ids.size && new Set(rankedIds).size === ids.size && rankedIds.every(id => ids.has(id));
            recommendation = complete && ids.has(ranking.recommended_quote_id)
              ? { status: "ready", data: ranking }
              : { status: "error", error: { code: "PROVIDER_ERROR", message: "La recomendación no corresponde a las cotizaciones de esta compra.", retryable: false } };
          }
        } catch {
          recommendation = { status: "error", error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar la recomendación del agente.", retryable: true } };
        }
      }
      return { ok: true, data: { purchase, rows: quotes.map(quote => {
        const supplier = suppliers.get(quote.supplier_contact_id)!;
        return { quote, supplier: { id: supplier.id, name: supplier.name, organization: supplier.organization } };
      }), quotes_status: "ready", recommendation, mode: "persisted" } };
    } catch {
      return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo consultar la comparación de cotizaciones.", true);
    }
  };
}
