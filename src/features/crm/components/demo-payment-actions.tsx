"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import type { OrderPayment, PurchaseOrder } from "../../../contracts/purchase-orders";
import { contactActionId } from "./contact-action-client";
import { postDemoOrderPayment, validDemoOrderPayment } from "./purchase-order-client";

export function DemoPaymentActions({ order, payment, enabled }: { order: PurchaseOrder; payment: OrderPayment | null; enabled: boolean }) {
  const router = useRouter(), busy = useRef(false);
  const [confirmed, setConfirmed] = useState(false), [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null), [result, setResult] = useState<OrderPayment | null>(null);
  const final = (value: OrderPayment | null) => value && ["confirmed", "reverted", "failed"].includes(value.status);
  const pastPreparation = (value: OrderPayment | null) => value && !["reserved", "prepared"].includes(value.status);
  const newestSafe = final(result) ? result : final(payment) ? payment : pastPreparation(result) ? result : pastPreparation(payment) ? payment : result ?? payment;
  const shown = validDemoOrderPayment(newestSafe, order);
  const canContinue = enabled && (!shown || shown.status === "reserved" || shown.status === "prepared");
  async function pay() {
    if (busy.current || !confirmed || !canContinue) return;
    busy.current = true; setLoading(true); setConfirmed(false); setMessage(null);
    try {
      const action = await contactActionId(`${order.company_id}:demo-payment:${order.id}`, { order_id: order.id });
      const response = await postDemoOrderPayment(order, action);
      if (!response.ok) setMessage(response.error.message);
      else setResult(response.data.payment);
      router.refresh();
    } catch { setMessage("No se pudo confirmar el intento. Consultá el estado antes de volver a actuar."); }
    finally { busy.current = false; setLoading(false); }
  }
  return <section aria-label="Pago de demo" className="space-y-4">
    <Alert tone="warning" title="Demo con datos ficticios">
      Esta orden usa datos ficticios, pero iniciará una transferencia real de 1 ARGt a la billetera de prueba en Arbitrum.
      Una vez iniciada, no se puede cancelar desde la aplicación.
    </Alert>
    <p className="break-all text-sm">Destino: <span className="font-mono">{order.wallet?.address}</span></p>
    {canContinue && <>
      <label className="flex items-start gap-2 text-sm"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} />
        Confirmo que quiero enviar 1 ARGt real a esta billetera de prueba.</label>
      <Button onClick={() => void pay()} loading={loading} disabled={!confirmed || loading}>{shown ? "Continuar intento de demo" : "Enviar 1 ARGt de demo"}</Button>
    </>}
    {message && <Alert tone="warning" title="Consultá el intento">{message}</Alert>}
    {shown && <Alert tone={shown.status === "confirmed" ? "success" : "warning"} title={shown.status === "confirmed" ? "Transferencia de demo confirmada" : "Transferencia de demo pendiente de verificación"}>
      {shown.status === "confirmed" ? "La red confirmó el envío de 1 ARGt." : "El último estado guardado no confirma un pago. Consultá el estado antes de actuar."}
      {shown.tx_hash && shown.explorer_url && <a href={shown.explorer_url} target="_blank" rel="noreferrer" className="mt-3 block break-all font-mono text-xs underline">{shown.tx_hash}</a>}
    </Alert>}
  </section>;
}
