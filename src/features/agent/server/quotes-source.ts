// Solo el TIPO de la cotización de Voz (Bautista): "import type" no trae código de su módulo.
import type { ComparatorQuote } from "../../voice/server/quote-import";
import type { QuoteForRanking } from "../../../contracts/purchases";

/**
 * BUY-03 (decisión 20 del README): pasa una cotización guardada en
 * supplier_quotes (como la entrega listSupplierQuotes de Voz) a la forma que
 * usa el ranking. Es pura (sin base ni red), por eso se puede probar sola.
 * NO tiene "server-only" a propósito: así los tests la pueden importar.
 */

/**
 * Voz guarda el precio en centavos de pesos (2 decimales) y ARGt usa 18
 * decimales: de centavos a unidades mínimas de ARGt hay que multiplicar por
 * 10^16. Se escribe con BigInt(10) ** BigInt(16) porque el proyecto compila
 * para una versión de JavaScript que no acepta números como "10n".
 */
const CENTAVOS_A_ATOMIC = BigInt(10) ** BigInt(16);

/** Arma la cotización para el ranking. El nombre del proveedor lo busca quien llama (en el CRM). */
export function toQuoteForRanking(quote: ComparatorQuote, supplierName: string): QuoteForRanking {
  return {
    quote_id: quote.id,
    supplier_contact_id: quote.supplier_contact_id,
    supplier_name: supplierName,
    // Solo comparamos precios en pesos: si cotizó en dólares (o sin precio), queda sin precio en pesos.
    // Con BigInt la cuenta es exacta: nunca pasa por números con coma.
    unit_price_atomic:
      quote.unit_price?.currency === "ARS"
        ? (BigInt(quote.unit_price.amount_atomic) * CENTAVOS_A_ATOMIC).toString()
        : null,
    // Si dijo que no puede entregar, cuenta como sin stock (0); si no, lo que dijo (o null si no se sabe).
    available_quantity: quote.can_supply === "no" ? 0 : quote.available_quantity,
    delivery_days: quote.lead_time_days,
    accepts_argt: quote.accepts_argt,
    // "call", "web" o "example": el mismo origen que usa el ranking.
    origin: quote.source.kind,
  };
}
