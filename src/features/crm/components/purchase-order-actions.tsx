"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import type { OrderPayment, PurchaseOrder } from "../../../contracts/purchase-orders";
import { clearContactAction, contactActionId } from "./contact-action-client";
import { orderPaymentPresentation, paymentBlockedReason, paymentIntentKey, postOrderPayment, readOrderPaymentIntent,
  refreshOrderSnapshot, storeOrderPaymentIntent, validOrderPayment, type OrderPayResult } from "./purchase-order-client";

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
  const [pending, setPending] = useState<"pay" | "refresh" | null>(null);
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

  const paymentState = returned ? orderPaymentPresentation(shownPayment, shownOrder) : null;
  return <section aria-label="Acciones de la orden" className="space-y-4">
    <h2 className="text-base font-bold">Aprobación y pago</h2>
    <p className="text-sm text-ink-muted">Una persona con permisos en la empresa confirma el importe y los datos de cobro antes de aprobar el pago.</p>
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
    <div className="flex flex-wrap gap-2.5">
      <Button variant="secondary" icon={RefreshCw} disabled={pending !== null} onClick={() => router.refresh()}>Consultar último estado guardado</Button>
      {shownOrder.status === "awaiting_approval" && !shownPayment && !paymentAttempted && <Button variant="ghost" loading={pending === "refresh"}
        disabled={pending === "pay"} onClick={() => void updateSnapshot()}>{refreshUncertain ? "Confirmar actualización" : "Actualizar datos de la orden"}</Button>}
    </div>
    {refreshError && <Alert tone={refreshUncertain ? "warning" : "danger"} title="Revisá los datos de la orden">{refreshError}</Alert>}
    {refreshSuccess && <p role="status" className="text-sm text-success">Actualizamos los datos guardados de la orden.</p>}
  </section>;
}
