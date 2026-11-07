"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import type { OrderPayment, PurchaseOrder } from "../../../contracts/purchase-orders";
import { clearContactAction, contactActionId } from "./contact-action-client";
import { orderPaymentPresentation, paymentBlockedReason, paymentIntentKey, postOrderPayment, readOrderPaymentIntent,
  refreshOrderSnapshot, storeOrderPaymentIntent, validOrderPayment, reconcileOrderPayment, canResumeOrderPayment, parseOrderPaymentIntent, postResumeOrderPayment, type OrderPayResult } from "./purchase-order-client";

function subscribePaymentIntent(listener: () => void) {
  window.addEventListener("order-payment-intent", listener);
  window.addEventListener("storage", listener);
  return () => { window.removeEventListener("order-payment-intent", listener); window.removeEventListener("storage", listener); };
}

export function PurchaseOrderActions({ order, payment, paymentAvailable }: {
  order: PurchaseOrder; payment?: OrderPayment | null; paymentAvailable: boolean;
}) {
  const router = useRouter();
  const busy = useRef(false);
  const refreshIntent = useRef<{ id: string; expected_version: number } | null>(null);
  const [pending, setPending] = useState<"pay" | "refresh" | "status" | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [refreshUncertain, setRefreshUncertain] = useState(false);
  const [refreshSuccess, setRefreshSuccess] = useState(false);
  const [returned, setReturned] = useState<OrderPayResult | null>(null);
  const key = paymentIntentKey(order);
  const storedIntent = useSyncExternalStore(subscribePaymentIntent, () => readOrderPaymentIntent(key), () => null);
  const paymentAttempted = storedIntent !== null;
  const shownOrder = returned?.order ?? order;
  const shownPayment = payment ?? returned?.payment;
  const reason = paymentBlockedReason(shownOrder, paymentAvailable, shownPayment);
  const receipt = validOrderPayment(shownPayment, shownOrder);
  const canResume = canResumeOrderPayment(shownOrder, storedIntent, shownPayment, paymentAvailable);

  async function approveAndPay() {
    if (busy.current || paymentAttempted || refreshUncertain || reason) return;
    busy.current = true; setPending("pay"); setPayError(null);
    let sent = false;
    try {
      const expected_version = order.version;
      const action_id = await contactActionId(`${order.company_id}:order-pay:${order.id}`, { expected_version });
      storeOrderPaymentIntent(key, { action_id, expected_version });
      sent = true;
      const result = await postOrderPayment(order, action_id, expected_version);
      if (!result.ok) {
        setPayError(result.error.message);
        return;
      }
      setReturned(result.data);
      router.refresh();
    } catch {
      setPayError(sent ? "No pudimos confirmar el resultado del intento. Consultá su estado antes de realizar otra acción."
        : "No se pudo preparar esta acción. Volvé a intentar.");
    } finally { busy.current = false; setPending(null); }
  }

  async function updateSnapshot() {
    if (busy.current || paymentAttempted || shownPayment || shownOrder.status !== "awaiting_approval") return;
    busy.current = true; setPending("refresh"); setRefreshError(null); setRefreshSuccess(false);
    const scope = `${order.company_id}:order-refresh:${order.id}`;
    try {
      if (!refreshIntent.current || (!refreshUncertain && refreshIntent.current.expected_version !== order.version)) {
        refreshIntent.current = { expected_version: order.version, id: await contactActionId(scope, { expected_version: order.version }) };
      }
      const result = await refreshOrderSnapshot(order, refreshIntent.current.id, refreshIntent.current.expected_version);
      if (!result.ok) {
        setRefreshUncertain(["PROVIDER_ERROR", "PROVIDER_UNAVAILABLE"].includes(result.error.code));
        setRefreshError(result.error.message);
        return;
      }
      clearContactAction(scope); refreshIntent.current = null; setRefreshUncertain(false); setRefreshSuccess(true);
      router.refresh();
    } catch {
      setRefreshUncertain(true);
      setRefreshError("No pudimos confirmar la actualización. Conservamos la misma acción para recuperar su resultado.");
    } finally { busy.current = false; setPending(null); }
  }

  async function resumePayment() {
    const intent = parseOrderPaymentIntent(storedIntent);
    if (busy.current || !canResume || refreshUncertain) return;
    busy.current = true; setPending("pay"); setPayError(null);
    try {
      const action_id = intent?.action_id ?? await contactActionId(`${order.company_id}:order-resume:${order.id}`, { order_id: order.id });
      if (!intent) storeOrderPaymentIntent(key, { action_id, expected_version: order.version });
      const result = order.status === "approved" ? await postResumeOrderPayment(order, action_id)
        : await postOrderPayment(order, action_id, intent!.expected_version);
      if (!result.ok) setPayError(result.error.message);
      else setReturned(result.data);
      router.refresh();
    } catch { setPayError("No pudimos confirmar el resultado. Conservamos la misma acción; consultá su estado."); }
    finally { busy.current = false; setPending(null); }
  }

  async function updatePaymentStatus() {
    if (busy.current) return;
    busy.current = true; setPending("status"); setPayError(null);
    try {
      const result = await reconcileOrderPayment(order);
      if (!result.ok) setPayError(result.error.message);
      else if (!result.data.chain_checked && result.data.payment) setPayError("No se pudo verificar el estado actual en la red. Se muestra el último estado guardado.");
      router.refresh();
    } catch { setPayError("No se pudo consultar la red. Se conserva el último estado guardado."); }
    finally { busy.current = false; setPending(null); }
  }

  const paymentState = returned ? orderPaymentPresentation(shownPayment, shownOrder) : null;
  return <section aria-label="Acciones de la orden" className="space-y-4">
    <h2 className="text-base font-bold">Aprobación y pago</h2>
    <p className="text-sm text-ink-muted">Una persona con permisos en la empresa confirma el importe y los datos de cobro antes de aprobar el pago.</p>
    {paymentAvailable && <p className="text-sm text-ink-muted">Una vez iniciado, el intento no se puede cancelar desde la aplicación. Revisá el importe y la dirección antes de continuar.</p>}
    <Button onClick={() => void approveAndPay()} loading={pending === "pay"}
      disabled={!!reason || paymentAttempted || refreshUncertain || pending === "refresh"}>Aprobar y pagar</Button>
    {reason && <p className="text-sm text-ink-muted">{reason}</p>}
    {payError && <Alert tone="warning" title="Revisá el intento de pago">{payError}</Alert>}
    {paymentState && <Alert tone={paymentState.tone} title={paymentState.label}>{paymentState.description}
      {receipt?.tx_hash && receipt.explorer_url && <a href={receipt.explorer_url} target="_blank" rel="noreferrer"
        className="mt-3 block break-all font-mono text-xs underline underline-offset-4">{receipt.tx_hash}</a>}</Alert>}
    {paymentAttempted && !receipt && <Alert tone="warning" title="Verificación pendiente">
      Hay un intento registrado para esta orden. La consulta de estado conserva su identidad y sus datos.
    </Alert>}
    {canResume && <Button variant="secondary" loading={pending === "pay"} disabled={pending !== null || refreshUncertain}
      onClick={() => void resumePayment()}>{shownOrder.status === "approved" ? "Continuar pago aprobado" : "Reintentar aprobación y pago"}</Button>}
    <div className="flex flex-wrap gap-2.5">
      <Button variant="secondary" icon={RefreshCw} disabled={pending !== null} onClick={() => void updatePaymentStatus()}>Consultar estado del pago</Button>
      {shownOrder.status === "awaiting_approval" && !shownPayment && !paymentAttempted && <Button variant="ghost" loading={pending === "refresh"}
        disabled={pending === "pay"} onClick={() => void updateSnapshot()}>{refreshUncertain ? "Confirmar actualización" : "Actualizar datos de la orden"}</Button>}
    </div>
    <p className="text-xs text-ink-muted">La consulta intenta verificar la red; si no responde, se muestra el último estado guardado.</p>
    {refreshError && <Alert tone={refreshUncertain ? "warning" : "danger"} title="Revisá los datos de la orden">{refreshError}</Alert>}
    {refreshSuccess && <p role="status" className="text-sm text-success">Actualizamos los datos guardados de la orden.</p>}
  </section>;
}
