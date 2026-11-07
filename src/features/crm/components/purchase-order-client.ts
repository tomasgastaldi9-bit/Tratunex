import { z } from "zod";
import { resultSchema, type Result } from "../../../contracts/common";
import { OrderPaymentSchema, PurchaseOrderSchema, type OrderPayment, type PurchaseOrder } from "../../../contracts/purchase-orders";

export function formatOrderQuoted(value: string, currency: string): string {
  const [integer, fraction] = value.split(".");
  return `${currency} ${BigInt(integer).toLocaleString("es-AR")}${fraction ? `,${fraction}` : ""}`;
}

export function formatOrderArgt(atomic: string): string {
  const amount = BigInt(atomic);
  const scale = BigInt(10) ** BigInt(18);
  const fraction = (amount % scale).toString().padStart(18, "0").replace(/0+$/, "");
  return `ARGt ${(amount / scale).toLocaleString("es-AR")}${fraction ? `,${fraction}` : ""}`;
}

export function paymentBlockedReason(order: PurchaseOrder, paymentAvailable: boolean, payment?: OrderPayment | null): string | null {
  if (order.quote_source === "example") return "Esta orden proviene de una cotización de ejemplo y se usa como dato de prueba.";
  if (payment) return "Hay un intento de pago registrado. Consultá su estado.";
  if (order.status === "approved") return "La orden ya está aprobada. El estado del pago se consulta por separado.";
  if (!paymentAvailable) return "El servicio de pagos está pendiente de integración.";
  if (!order.amount_atomic || order.pricing_status !== "ready") return "El importe de la cotización requiere conversión antes de aprobar el pago.";
  if (!order.wallet || !/^0x[0-9a-fA-F]{40}$/.test(order.wallet.address) || /^0x0{40}$/i.test(order.wallet.address)) {
    return "Falta una billetera de cobro válida en los datos de la orden.";
  }
  if (order.wallet.chain !== "arbitrum") return "Esta orden requiere una billetera de cobro en Arbitrum.";
  return null;
}

export function validOrderPayment(payment: OrderPayment | null | undefined, order: PurchaseOrder): OrderPayment | null {
  const parsed = OrderPaymentSchema.safeParse(payment);
  if (!parsed.success || order.status !== "approved" || parsed.data.amount_atomic !== order.amount_atomic
    || parsed.data.chain !== order.wallet?.chain) return null;
  return parsed.data;
}

export function orderPaymentPresentation(payment: OrderPayment | null | undefined, order: PurchaseOrder) {
  const valid = validOrderPayment(payment, order);
  if (!valid) return { label: "Verificación pendiente", tone: "warning" as const,
    description: "Todavía no hay una confirmación de pago para esta orden." };
  if (valid.status === "confirmed") return { label: "Pagada", tone: "success" as const,
    description: "El servicio confirmó el pago y registró su transacción." };
  if (valid.status === "failed" || valid.status === "reverted") return { label: "Falló", tone: "danger" as const,
    description: "El intento no se confirmó. Consultá su estado antes de decidir otra acción." };
  if (valid.status === "unknown") return { label: "Verificación pendiente", tone: "warning" as const,
    description: "El último estado guardado es incierto. Un hash preparado no demuestra que la transacción haya sido enviada." };
  if (valid.status === "prepared") return { label: "Transacción preparada", tone: "warning" as const,
    description: "El hash corresponde a una transacción preparada; todavía no demuestra que haya sido enviada." };
  return { label: "Pago en proceso", tone: "info" as const,
    description: "Hay un intento registrado y su confirmación está pendiente." };
}

const payResponse = resultSchema(z.object({ order: PurchaseOrderSchema, payment: OrderPaymentSchema.nullable() }));
const orderResponse = resultSchema(z.object({ order: PurchaseOrderSchema }));
const paymentResponse = resultSchema(z.object({ payment: OrderPaymentSchema.nullable(), chain_checked: z.boolean() }));
export type OrderPayResult = { order: PurchaseOrder; payment: OrderPayment | null };

export async function reconcileOrderPayment(order: PurchaseOrder): Promise<Result<{ payment: OrderPayment | null; chain_checked: boolean }>> {
  const action_id = `reconcile:${order.id}`;
  const response = await fetch(`/api/crm/orders/${order.id}/payment-status`, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input: {} }) });
  const parsed = paymentResponse.safeParse(await response.json() as unknown);
  if (!parsed.success || (parsed.data.ok && !response.ok)) throw new Error("No se pudo consultar el estado del pago.");
  return parsed.data;
}

function sameOrder(returned: PurchaseOrder, expected: PurchaseOrder) {
  return returned.id === expected.id && returned.company_id === expected.company_id && returned.purchase_request_id === expected.purchase_request_id
    && returned.supplier_quote_id === expected.supplier_quote_id && returned.supplier_contact_id === expected.supplier_contact_id
    && returned.version >= expected.version;
}

async function post(url: string, action_id: string, expected_version: number) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input: { expected_version } }) });
    return { httpOk: response.ok, payload: await response.json() as unknown };
  } finally { clearTimeout(timeout); }
}

export async function postOrderPayment(order: PurchaseOrder, action_id: string, expected_version: number): Promise<Result<OrderPayResult>> {
  const response = await post(`/api/crm/orders/${order.id}/pay`, action_id, expected_version);
  const parsed = payResponse.safeParse(response.payload);
  if (!parsed.success) throw new Error("El servicio no confirmó un estado de pago válido.");
  if (parsed.data.ok) {
    const returned = parsed.data.data;
    if (!response.httpOk || !sameOrder(returned.order, order) || returned.order.status !== "approved"
      || returned.order.amount_atomic !== order.amount_atomic || returned.order.wallet?.chain !== order.wallet?.chain
      || returned.order.wallet?.address.toLowerCase() !== order.wallet?.address.toLowerCase()
      || (returned.payment !== null && !validOrderPayment(returned.payment, returned.order))) {
      throw new Error("El servicio no confirmó el pago correspondiente a esta orden.");
    }
  }
  return parsed.data;
}

export async function postResumeOrderPayment(order: PurchaseOrder, action_id: string): Promise<Result<OrderPayResult>> {
  const response = await fetch(`/api/crm/orders/${order.id}/resume-payment`, { method: "POST", credentials: "same-origin",
    headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input: {} }) });
  const parsed = payResponse.safeParse(await response.json() as unknown);
  if (!parsed.success) throw new Error("El servicio no confirmó un estado de pago válido.");
  if (parsed.data.ok && (!response.ok || !sameOrder(parsed.data.data.order, order) || parsed.data.data.order.status !== "approved"
    || parsed.data.data.order.amount_atomic !== order.amount_atomic || parsed.data.data.order.wallet?.address.toLowerCase() !== order.wallet?.address.toLowerCase()
    || (parsed.data.data.payment !== null && !validOrderPayment(parsed.data.data.payment, parsed.data.data.order)))) throw new Error("El servicio no confirmó el pago correspondiente a esta orden.");
  return parsed.data;
}

export async function refreshOrderSnapshot(order: PurchaseOrder, action_id: string, expected_version: number): Promise<Result<{ order: PurchaseOrder }>> {
  const response = await post(`/api/crm/orders/${order.id}/refresh`, action_id, expected_version);
  const parsed = orderResponse.safeParse(response.payload);
  if (!parsed.success || (parsed.data.ok && (!response.httpOk || !sameOrder(parsed.data.data.order, order)))) {
    throw new Error("No se pudo confirmar la actualización de los datos de la orden.");
  }
  return parsed.data;
}

export type OrderPaymentIntent = { action_id: string; expected_version: number };
const intentSchema = z.object({ action_id: z.string().min(1), expected_version: z.number().int().positive() }).strict();
const memory = new Map<string, string>();
const unavailable = new Set<string>();
export const paymentIntentKey = (order: PurchaseOrder) => `tratunex-order-payment:${order.company_id}:${order.id}`;

export function parseOrderPaymentIntent(value: string | null): OrderPaymentIntent | null {
  if (!value) return null;
  try { const parsed = intentSchema.safeParse(JSON.parse(value)); return parsed.success ? parsed.data : null; } catch { return null; }
}

/** Continue only the same browser action after checking that no reservation is visible. */
export function canResumeOrderPayment(order: PurchaseOrder, stored: string | null, payment: OrderPayment | null | undefined, paymentAvailable: boolean): boolean {
  const intent = parseOrderPaymentIntent(stored);
  if (!paymentAvailable || payment || order.quote_source === "example") return false;
  if (order.status === "awaiting_approval") return !!intent && intent.expected_version === order.version && paymentBlockedReason(order, true, null) === null;
  return order.status === "approved" && (!intent || order.version === intent.expected_version + 1 || order.version === intent.expected_version);
}

export function readOrderPaymentIntent(key: string): string | null {
  if (unavailable.has(key)) return memory.get(key) ?? null;
  try { return sessionStorage.getItem(key) ?? memory.get(key) ?? null; }
  catch { return memory.get(key) ?? null; }
}

export function storeOrderPaymentIntent(key: string, intent: OrderPaymentIntent) {
  const value = JSON.stringify(intent);
  memory.set(key, value);
  try { sessionStorage.setItem(key, value); unavailable.delete(key); } catch { unavailable.add(key); }
  window.dispatchEvent(new Event("order-payment-intent"));
}
