import { z } from "zod";
import type { ActionCtx, Ctx, Result } from "./common";

/**
 * Contrato de COMPRAS del lado del dueño (dueña: Vale). Brief v3 §5, §7, §8 y §9.
 *
 *  - BUY-01: la compra que necesita la pyme ("500 vasos para el lunes").
 *  - BUY-02: las reglas de pago del dueño y checkPurchasePolicy, que el pago
 *    de Tomás (payInvoice, PAY-02) llama ANTES de firmar.
 *  - BUY-03 (rankQuotes) se agrega acá después, como campos/funciones nuevas.
 *
 * Regla del equipo: una vez publicado, solo se AGREGAN campos.
 */

// ---------------------------------------------------------------------------
// Plata: ARGt en "unidades mínimas" (brief v3 §9)
// ---------------------------------------------------------------------------

/** Token con el que paga el agente. Fijo para el MVP. */
export const PAYMENT_TOKEN = "ARGt";

/** ARGt tiene 18 decimales: 1 ARGt = 10^18 unidades mínimas. */
export const ARGT_DECIMALS = 18;
const UNIDADES_POR_ARGT = BigInt(10) ** BigInt(ARGT_DECIMALS);

/**
 * Un monto siempre viaja como TEXTO con un número entero de unidades mínimas
 * ("amount_atomic"). Nunca como número con coma: los decimales de JavaScript
 * redondean y con plata eso no se puede permitir.
 */
export const atomicAmountSchema = z.string().regex(/^\d+$/, "Escribí un monto válido, sin comas ni puntos");

/** Pesos enteros (lo que escribe la persona) → unidades mínimas de ARGt (1 ARGt ≈ 1 peso). */
export function pesosToAtomic(pesos: number | bigint | string): string {
  return (BigInt(pesos) * UNIDADES_POR_ARGT).toString();
}

/** Unidades mínimas → pesos enteros, para mostrar. Corta los decimales (no redondea). */
export function atomicToPesos(atomic: string): bigint {
  return BigInt(atomic) / UNIDADES_POR_ARGT;
}

/** Muestra un monto como "$ 100.000" (formato argentino). */
export function formatPesos(atomic: string): string {
  return `$ ${atomicToPesos(atomic).toLocaleString("es-AR")}`;
}

/** true si el texto es un entero sin signo ("100", no "1.5" ni "-3"). */
function esEntero(valor: string): boolean {
  return /^\d+$/.test(valor);
}

/**
 * Compara dos montos de texto sin pasar por números con coma.
 * Si alguno no es un entero válido devuelve false en vez de explotar:
 * BigInt("1.5") tira un error, y Zod igual corre estas comprobaciones aunque
 * la del formato ya haya fallado (ese error ya lo reporta el regex).
 */
function mayor(a: string, b: string): boolean {
  if (!esEntero(a) || !esEntero(b)) return false;
  return BigInt(a) > BigInt(b);
}

// ---------------------------------------------------------------------------
// BUY-01: la compra (purchase_requests)
// ---------------------------------------------------------------------------

export const PURCHASE_PRODUCT_MAX = 120;
export const PURCHASE_UNIT_MAX = 30;
export const PURCHASE_ZONE_MAX = 120;
export const PURCHASE_QUANTITY_MAX = 1_000_000;

/** Texto con máximo y sin espacios sobrantes. */
function texto(max: number) {
  return z.string().trim().max(max, `Usá como máximo ${max} caracteres`);
}

/** Lo que carga el dueño en "Nueva compra". */
export const purchaseRequestInputSchema = z.object({
  /** Qué necesita: "Vasos térmicos de 240 cc". */
  product: texto(PURCHASE_PRODUCT_MAX).min(1, "Escribí qué necesitás comprar"),
  /** Cuántos: 500. */
  quantity: z
    .number({ error: "Escribí la cantidad con números" })
    .int("La cantidad tiene que ser un número entero")
    .min(1, "La cantidad tiene que ser al menos 1")
    .max(PURCHASE_QUANTITY_MAX, "La cantidad es demasiado grande"),
  /** Opcional: "unidades", "cajas", "kg". Vacío = unidades. */
  unit: texto(PURCHASE_UNIT_MAX),
  /** Para cuándo lo necesita: fecha "AAAA-MM-DD" en hora de Argentina. */
  needed_by: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Elegí la fecha para cuándo lo necesitás"),
  /** Presupuesto TOTAL de la compra, en unidades mínimas de ARGt. Mayor a cero. */
  budget_atomic: atomicAmountSchema.refine((v) => mayor(v, "0"), "El presupuesto tiene que ser mayor a cero"),
  /** Opcional: dónde tiene que entregar el proveedor ("CABA"). */
  zone: texto(PURCHASE_ZONE_MAX),
});
export type PurchaseRequestInput = z.infer<typeof purchaseRequestInputSchema>;

/** Estado de la compra. El MVP solo crea compras abiertas; las órdenes son de Nano. */
export const purchaseRequestStatusSchema = z.enum(["open"]);

/** Una compra guardada. */
export const purchaseRequestSchema = purchaseRequestInputSchema.extend({
  id: z.uuid(),
  status: purchaseRequestStatusSchema,
  /** ISO UTC. */
  created_at: z.string(),
  created_by: z.string().nullable(),
});
export type PurchaseRequest = z.infer<typeof purchaseRequestSchema>;

// ---------------------------------------------------------------------------
// BUY-02: reglas de pago del dueño (purchase_policies, una por empresa)
// ---------------------------------------------------------------------------

/** Máximo de proveedores en la lista de permitidos. */
export const ALLOWED_SUPPLIERS_MAX = 100;

/**
 * Las reglas que el dueño le pone al agente para pagar. Una por empresa:
 * valen para todas las compras (por eso checkPurchasePolicy no recibe la compra).
 */
export const purchasePolicySchema = z
  .object({
    /** Ninguna compra puede superar este monto: arriba de esto se rechaza. */
    max_per_purchase_atomic: atomicAmountSchema,
    /** Hasta este monto el agente paga solo; arriba (y hasta el máximo) pide aprobación. */
    auto_pay_limit_atomic: atomicAmountSchema,
    /** true = solo se les paga a los proveedores de la lista. */
    only_allowed_suppliers: z.boolean(),
    /** Ids de contactos del CRM (proveedores) a los que se les puede pagar. */
    allowed_supplier_ids: z
      .array(z.uuid())
      .max(ALLOWED_SUPPLIERS_MAX, `Elegí como máximo ${ALLOWED_SUPPLIERS_MAX} proveedores`),
  })
  .refine((p) => !mayor(p.auto_pay_limit_atomic, p.max_per_purchase_atomic), {
    error: "Lo que el agente paga solo no puede superar el máximo por compra",
    path: ["auto_pay_limit_atomic"],
  })
  .refine((p) => !p.only_allowed_suppliers || p.allowed_supplier_ids.length > 0, {
    error: "Elegí al menos un proveedor permitido, o desactivá el filtro",
    path: ["allowed_supplier_ids"],
  });
export type PurchasePolicy = z.infer<typeof purchasePolicySchema>;

/** Qué decide el agente frente a un pago. */
export const policyDecisionSchema = z.enum(["auto_pay", "needs_approval", "rejected"]);
export type PolicyDecision = z.infer<typeof policyDecisionSchema>;

export const POLICY_DECISION_LABELS: Record<PolicyDecision, string> = {
  auto_pay: "Paga solo",
  needs_approval: "Pide aprobación",
  rejected: "Rechaza",
};

export type PolicyCheck = { decision: PolicyDecision; reason: string };

/**
 * LA regla, en un solo lugar. La usan el servidor (checkPurchasePolicy, antes
 * de pagar) y la pantalla de reglas (para mostrar "así decide el agente"),
 * así nunca pueden decir cosas distintas. Se evalúa de arriba hacia abajo:
 *  1. Sin reglas cargadas → pide aprobación (nunca paga solo sin reglas).
 *  2. Supera el máximo por compra → rechaza.
 *  3. Filtro de proveedores activo y el proveedor no está → rechaza.
 *  4. Supera lo que paga solo → pide aprobación.
 *  5. Si no → paga solo.
 * El motivo está escrito para leérselo al dueño ("explica cada movimiento").
 */
export function decidePurchasePolicy(
  policy: PurchasePolicy | null,
  amountAtomic: string,
  supplierContactId: string,
): PolicyCheck {
  if (!policy) {
    return {
      decision: "needs_approval",
      reason: "Todavía no hay reglas de pago cargadas, así que una persona tiene que aprobarlo.",
    };
  }
  if (mayor(amountAtomic, policy.max_per_purchase_atomic)) {
    return {
      decision: "rejected",
      reason: `${formatPesos(amountAtomic)} supera el máximo por compra de ${formatPesos(policy.max_per_purchase_atomic)}.`,
    };
  }
  if (policy.only_allowed_suppliers && !policy.allowed_supplier_ids.includes(supplierContactId)) {
    return {
      decision: "rejected",
      reason: "El proveedor no está en la lista de proveedores permitidos.",
    };
  }
  if (mayor(amountAtomic, policy.auto_pay_limit_atomic)) {
    return {
      decision: "needs_approval",
      reason: `${formatPesos(amountAtomic)} supera lo que el agente puede pagar solo (${formatPesos(policy.auto_pay_limit_atomic)}): necesita aprobación.`,
    };
  }
  return {
    decision: "auto_pay",
    reason: `${formatPesos(amountAtomic)} está dentro de las reglas: hasta ${formatPesos(policy.auto_pay_limit_atomic)} el agente paga solo.`,
  };
}

// ---------------------------------------------------------------------------
// Funciones públicas (src/features/agent/server/public.ts)
// ---------------------------------------------------------------------------

export const createPurchaseRequestOutputSchema = z.object({
  purchase_request: purchaseRequestSchema,
  /** false si era un reintento del mismo action_id: no se creó otra. */
  created: z.boolean(),
});
export type CreatePurchaseRequestOutput = z.infer<typeof createPurchaseRequestOutputSchema>;

export const getPurchasePolicyOutputSchema = z.object({
  /** null = la empresa todavía no cargó reglas. */
  policy: purchasePolicySchema.nullable(),
  /** true si la persona puede cambiar las reglas (solo admin). */
  can_edit: z.boolean(),
});
export type GetPurchasePolicyOutput = z.infer<typeof getPurchasePolicyOutputSchema>;

export const checkPurchasePolicyInputSchema = z.object({
  amount_atomic: atomicAmountSchema.refine((v) => mayor(v, "0"), "El monto tiene que ser mayor a cero"),
  supplier_contact_id: z.uuid(),
});
export type CheckPurchasePolicyInput = z.infer<typeof checkPurchasePolicyInputSchema>;

/**
 * Errores (ErrorCode de common.ts): VALIDATION_ERROR (datos inválidos),
 * FORBIDDEN (no es miembro; al guardar reglas, no es admin), NOT_FOUND (la
 * compra no existe o es de otra empresa), CONFLICT (action_id reusado con
 * otros datos), PROVIDER_UNAVAILABLE (la base no respondió, retryable).
 */
export type CreatePurchaseRequest = (
  ctx: ActionCtx,
  input: PurchaseRequestInput,
) => Promise<Result<CreatePurchaseRequestOutput>>;
export type GetPurchaseRequest = (
  ctx: Ctx,
  input: { purchase_request_id: string },
) => Promise<Result<{ purchase_request: PurchaseRequest }>>;
export type GetPurchasePolicy = (ctx: Ctx) => Promise<Result<GetPurchasePolicyOutput>>;
export type SavePurchasePolicy = (
  ctx: ActionCtx,
  input: { policy: PurchasePolicy },
) => Promise<Result<{ policy: PurchasePolicy }>>;
/** La llama payInvoice (Tomás) en el servidor ANTES de firmar un pago. */
export type CheckPurchasePolicy = (
  ctx: Ctx,
  input: CheckPurchasePolicyInput,
) => Promise<Result<PolicyCheck>>;

// ---------------------------------------------------------------------------
// BUY-03: elegir el mejor proveedor y explicarlo (rankQuotes)
// ---------------------------------------------------------------------------

/** De dónde salió la cotización. "example" = dato de prueba rotulado (brief v3 §4). */
export const quoteOriginSchema = z.enum(["call", "web", "example"]);
export type QuoteOrigin = z.infer<typeof quoteOriginSchema>;

export const QUOTE_ORIGIN_LABELS: Record<QuoteOrigin, string> = {
  call: "Llamada",
  web: "Web",
  example: "Datos de prueba",
};

/** Sí / no / no se sabe (igual que lo que extrae la llamada de Bautista). */
export const yesNoUnknownSchema = z.enum(["yes", "no", "unknown"]);
export type YesNoUnknown = z.infer<typeof yesNoUnknownSchema>;

/**
 * Una cotización tal como la necesita el ranking. La guarda y la manda quien
 * tiene las cotizaciones (Nano en el comparador): este módulo no es dueño de
 * supplier_quotes, solo decide cuál conviene.
 */
export const quoteForRankingSchema = z.object({
  quote_id: z.string().trim().min(1),
  supplier_contact_id: z.uuid(),
  supplier_name: z.string().trim().min(1).max(120),
  /** Precio por unidad en unidades mínimas de ARGt. null = no dio precio. */
  unit_price_atomic: atomicAmountSchema.nullable(),
  /** Cuántas puede entregar. null = no lo sabemos. */
  available_quantity: z.number().int().min(0).nullable(),
  /** En cuántos días entrega. null = no lo sabemos. */
  delivery_days: z.number().int().min(0).max(365).nullable(),
  accepts_argt: yesNoUnknownSchema,
  origin: quoteOriginSchema,
});
export type QuoteForRanking = z.infer<typeof quoteForRankingSchema>;

export const RANK_QUOTES_MAX = 20;

export const rankQuotesInputSchema = z.object({
  purchase_request_id: z.uuid(),
  quotes: z
    .array(quoteForRankingSchema)
    .min(1, "Hace falta al menos una cotización")
    .max(RANK_QUOTES_MAX, `Mandá como máximo ${RANK_QUOTES_MAX} cotizaciones`),
});
export type RankQuotesInput = z.infer<typeof rankQuotesInputSchema>;

/** Una cotización ya ordenada, con el porqué. */
export const quoteRankSchema = z.object({
  quote_id: z.string(),
  supplier_contact_id: z.string(),
  supplier_name: z.string(),
  /** 1 = la mejor. Las que no califican van al final. */
  position: z.number().int().min(1),
  /** false si no sirve para esta compra (sin precio, se pasa del presupuesto, etc.). */
  eligible: z.boolean(),
  /** Precio unitario × cantidad pedida. null si no dio precio. */
  total_atomic: atomicAmountSchema.nullable(),
  /** Motivos en castellano, para mostrarle al dueño. */
  reasons: z.array(z.string()),
  /** Qué haría el agente al pagarla según las reglas (null si no califica). */
  policy: z.object({ decision: policyDecisionSchema, reason: z.string() }).nullable(),
});
export type QuoteRank = z.infer<typeof quoteRankSchema>;

export const rankQuotesOutputSchema = z.object({
  ranking: z.array(quoteRankSchema),
  /** La recomendada (la primera que califica), o null si ninguna sirve. */
  recommended_quote_id: z.string().nullable(),
  /** 2-3 frases: por qué esa, qué regla aplicó y si paga solo o pide aprobación. */
  explanation: z.string(),
  /** "ai" = la escribió Claude; "rules" = respaldo armado con reglas (sin IA). */
  explanation_source: z.enum(["ai", "rules"]),
});
export type RankQuotesOutput = z.infer<typeof rankQuotesOutputSchema>;

/**
 * Ordena las cotizaciones de una compra, recomienda una y explica por qué.
 * Errores: VALIDATION_ERROR, NOT_FOUND (la compra no es de la empresa),
 * PROVIDER_UNAVAILABLE (la base no respondió). Si la IA falla, NO es un error:
 * se usa la explicación de respaldo y explanation_source = "rules".
 */
export type RankQuotes = (ctx: Ctx, input: RankQuotesInput) => Promise<Result<RankQuotesOutput>>;
