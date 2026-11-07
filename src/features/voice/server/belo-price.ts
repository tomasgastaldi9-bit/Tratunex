import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import type { Result } from "../../../contracts/common";
import { BeloPriceSchema, type BeloPair, type BeloPrice } from "../../../contracts/voice";
import type { FetchLike } from "./vapi-api";

// Precio de Belo (QUO-04): GET https://api.belo.app/public/price devuelve una
// lista de pares con bid y ask como texto, sin hora. Es pública: no lleva clave.

export const BELO_PRICE_URL = "https://api.belo.app/public/price";

const BeloPairsSchema = z.array(
  z.object({ pairCode: z.string(), bid: z.string(), ask: z.string() }).loose(),
);

function failure(code: "PROVIDER_ERROR" | "PROVIDER_UNAVAILABLE", message: string, retryable: boolean) {
  return { ok: false as const, error: { code, message, retryable } };
}

export async function fetchBeloPrice(
  pair: BeloPair,
  options: { fetchImpl?: FetchLike; now?: () => Date; timeoutMs?: number } = {},
): Promise<Result<BeloPrice>> {
  let response: Response;
  try {
    response = await (options.fetchImpl ?? fetch)(BELO_PRICE_URL, {
      cache: "no-store",
      signal: AbortSignal.timeout(options.timeoutMs ?? 5_000),
    });
  } catch {
    return failure("PROVIDER_UNAVAILABLE", "No se pudo consultar el precio de Belo", true);
  }
  if (!response.ok) {
    return failure("PROVIDER_UNAVAILABLE", `Belo respondió ${response.status}`, response.status >= 500 || response.status === 429);
  }

  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return failure("PROVIDER_ERROR", "Belo devolvió una respuesta que no es JSON", false);
  }
  const pairs = BeloPairsSchema.safeParse(body);
  if (!pairs.success) return failure("PROVIDER_ERROR", "Belo cambió el formato de precios", false);

  const row = pairs.data.find((item) => item.pairCode === pair);
  if (!row) return failure("PROVIDER_ERROR", `Belo no publica el par ${pair}`, false);

  const bid = Number(row.bid);
  const ask = Number(row.ask);
  const price = BeloPriceSchema.safeParse({
    pair,
    bid,
    ask,
    mid: (bid + ask) / 2,
    fetched_at: (options.now ?? (() => new Date()))().toISOString(),
  });
  return price.success ? { ok: true, data: price.data } : failure("PROVIDER_ERROR", "Belo publicó un precio inválido", false);
}

// Equivalente de un monto en pesos y en USDT con el precio medio de Belo. Es
// solo para mostrar: no es el precio de una operación ni convierte el pago.
export function beloEquivalent(amount: number, currency: "ARS" | "USD", price: BeloPrice): { ars: number; usdt: number } {
  return currency === "ARS"
    ? { ars: amount, usdt: amount / price.mid }
    : { ars: amount * price.mid, usdt: amount };
}
