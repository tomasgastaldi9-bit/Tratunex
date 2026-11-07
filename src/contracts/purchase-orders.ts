import { z } from "zod";
import type { ActionCtx, Ctx, Result } from "./common";
import { CollectionWalletSchema } from "./crm";

const id = z.uuid();
const atomic = z.string().regex(/^[1-9]\d{0,77}$/).refine(value => /^[1-9]\d{0,77}$/.test(value) && BigInt(value) < BigInt(2) ** BigInt(256));
export const CreatePurchaseOrderInputSchema = z.object({ supplier_quote_id: id }).strict();
export const GetPurchaseOrderInputSchema = z.object({ order_id: id }).strict();
export const ApprovePurchaseOrderInputSchema = GetPurchaseOrderInputSchema.extend({ expected_version: z.number().int().positive() }).strict();
export const RefreshPurchaseOrderInputSchema = ApprovePurchaseOrderInputSchema;
export const PurchaseOrderListInputSchema = z.object({ limit: z.number().int().min(1).max(100).default(50) }).strict();

/** Precios de la oferta: textos decimales exactos, separados del monto de liquidación ARGt. */
export const PurchaseOrderSchema = z.object({
  id, company_id: id, purchase_request_id: id, supplier_quote_id: id, supplier_contact_id: id,
  product: z.string().min(1), quantity: z.number().int().positive().max(1_000_000), unit: z.string(),
  supplier_name: z.string().min(1), quote_source: z.enum(["call", "web", "example"]),
  quoted_unit_price: z.string().regex(/^\d+(\.\d+)?$/),
  quoted_total: z.string().regex(/^\d+(\.\d+)?$/), quoted_currency: z.enum(["ARS", "USD", "ARGt"]),
  amount_atomic: atomic.nullable(),
  pricing_status: z.enum(["ready", "pending_conversion"]),
  status: z.enum(["awaiting_approval", "approved"]),
  version: z.number().int().positive(),
  wallet: CollectionWalletSchema.nullable(),
  wallet_version: z.number().int().nonnegative(),
  approved_by: id.nullable(), approved_at: z.string().datetime().nullable(),
  created_at: z.string().datetime(), updated_at: z.string().datetime(),
}).strict().superRefine((order, ctx) => {
  if ((order.pricing_status === "ready") !== (order.amount_atomic !== null)) ctx.addIssue({ code: "custom", path: ["amount_atomic"], message: "El monto no coincide con el estado de liquidación" });
  if (order.status === "approved" && (!order.approved_by || !order.approved_at || order.wallet?.chain !== "arbitrum" || order.wallet_version < 1 || !order.amount_atomic || order.quote_source === "example")) ctx.addIssue({ code: "custom", path: ["status"], message: "La aprobación requiere monto, billetera Arbitrum vigente, fuente real y persona" });
  if (order.status === "awaiting_approval" && (order.approved_by !== null || order.approved_at !== null)) ctx.addIssue({ code: "custom", path: ["status"], message: "Una orden pendiente no tiene aprobación" });
});
export const PurchaseOrderDataSchema = z.object({ order: PurchaseOrderSchema });
export const CreatePurchaseOrderDataSchema = PurchaseOrderDataSchema.extend({ created: z.boolean() });
export const PurchaseOrderPageSchema = z.object({ items: z.array(PurchaseOrderSchema).max(100) });
export type PurchaseOrder = z.infer<typeof PurchaseOrderSchema>;
export type CreatePurchaseOrderInput = z.infer<typeof CreatePurchaseOrderInputSchema>;
export type GetPurchaseOrderInput = z.infer<typeof GetPurchaseOrderInputSchema>;
export type ApprovePurchaseOrderInput = z.infer<typeof ApprovePurchaseOrderInputSchema>;
export type RefreshPurchaseOrderInput = z.infer<typeof RefreshPurchaseOrderInputSchema>;
export type PurchaseOrderListInput = z.infer<typeof PurchaseOrderListInputSchema>;
export type GetPurchaseOrder = (ctx: Ctx, input: GetPurchaseOrderInput) => Promise<Result<{ order: PurchaseOrder }>>;
export type CreatePurchaseOrder = (ctx: ActionCtx, input: CreatePurchaseOrderInput) => Promise<Result<{ order: PurchaseOrder; created: boolean }>>;
export type ApprovePurchaseOrder = (ctx: ActionCtx, input: ApprovePurchaseOrderInput) => Promise<Result<{ order: PurchaseOrder }>>;
export type RefreshPurchaseOrder = (ctx: ActionCtx, input: RefreshPurchaseOrderInput) => Promise<Result<{ order: PurchaseOrder }>>;

/** Respuesta mínima de PAY-02. Un hash no confirma por sí solo el pago. */
export const OrderPaymentSchema = z.object({
  id, status: z.enum(["reserved", "prepared", "submitted", "pending", "unknown", "confirmed", "reverted", "failed"]),
  tx_hash: z.string().regex(/^0x[0-9a-fA-F]{64}$/).nullable(),
  explorer_url: z.string().url().nullable(), amount_atomic: atomic,
  token: z.literal("ARGt"), chain: z.literal("arbitrum"),
}).strict().superRefine((payment, ctx) => {
  if (payment.status === "confirmed" && (!payment.tx_hash || !payment.explorer_url)) ctx.addIssue({ code: "custom", path: ["status"], message: "El pago confirmado requiere hash y explorer" });
  if (payment.explorer_url && (!payment.tx_hash || payment.explorer_url !== `https://arbiscan.io/tx/${payment.tx_hash}`)) ctx.addIssue({ code: "custom", path: ["explorer_url"], message: "El enlace debe corresponder al hash en Arbitrum" });
});
export type OrderPayment = z.infer<typeof OrderPaymentSchema>;
