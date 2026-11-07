import Link from "next/link";
import { ArrowLeft, ArrowRight, FileText, FlaskConical } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { buttonStyles } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";
import type { ErrorCode } from "../../../contracts/common";
import type { OrderPayment, PurchaseOrder } from "../../../contracts/purchase-orders";
import { SuppliersFrame } from "./supplier-view";
import { PurchaseOrderActions } from "./purchase-order-actions";
import { DemoPaymentActions } from "./demo-payment-actions";
import { formatOrderArgt, formatOrderQuoted, orderPaymentPresentation, validOrderPayment, validDemoOrderPayment } from "./purchase-order-client";

type Company = { id: string; name: string; industry?: string | null };
const chains = { base: "Base", arbitrum: "Arbitrum" };
const date = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" });

function OrderStatus({ order }: { order: PurchaseOrder }) {
  return <Badge tone={order.status === "approved" ? "info" : "warning"}>{order.status === "approved" ? "Aprobada" : "Pendiente de aprobación"}</Badge>;
}

export function OrdersListView({ company, orders }: { company: Company; orders: PurchaseOrder[] }) {
  return <SuppliersFrame company={company}>
    <PageHeader title="Órdenes de compra" description="Revisá los datos de cada orden, su aprobación y el estado del pago." />
    {!orders.length ? <EmptyState icon={FileText} title="Todavía no hay órdenes de compra"
      description="Las órdenes se crean al elegir una cotización de una solicitud de compra."
      action={<Link href="/purchases/new" className={buttonStyles({ variant: "secondary" })}>Nueva compra<ArrowRight size={16} aria-hidden /></Link>} />
      : <section aria-label="Órdenes de la empresa" className="space-y-4">
        <p className="text-xs text-ink-muted">{orders.length} {orders.length === 1 ? "orden cargada" : "órdenes cargadas"}</p>
        <ul className="space-y-4">{orders.map(order => <li key={order.id}><Card className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0 flex-1"><h2 className="break-words text-base font-bold">{order.product}</h2>
            <p className="mt-2 break-words text-sm text-ink-muted">{order.supplier_name} · {order.quantity.toLocaleString("es-AR")} {order.unit || "unidades"}</p></div>
            <OrderStatus order={order} /></div>
          <div className="flex flex-wrap items-center justify-between gap-3"><p className="break-all text-sm font-bold">Cotización: {formatOrderQuoted(order.quoted_total, order.quoted_currency)}</p>
            {order.quote_source === "example" && <Badge icon={FlaskConical}>Ejemplo<span className="sr-only"> (datos de prueba)</span></Badge>}
            <Link href={`/orders/${order.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })} aria-label={`Ver orden de ${order.product}`}>Ver orden<ArrowRight size={14} aria-hidden /></Link></div>
        </Card></li>)}</ul>
      </section>}
  </SuppliersFrame>;
}

function Datum({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0"><dt className="text-xs text-ink-muted">{label}</dt><dd className="mt-1.5 break-words text-sm font-bold">{children}</dd></div>;
}

export function PurchaseOrderView({ company, order, payment, paymentAvailable, paymentLookupFailed = false, demoPaymentAvailable = false }: {
  company: Company; order: PurchaseOrder; payment?: OrderPayment | null; paymentAvailable: boolean; paymentLookupFailed?: boolean; demoPaymentAvailable?: boolean;
}) {
  const verifiedPayment = validOrderPayment(payment, order);
  const verifiedDemoPayment = validDemoOrderPayment(payment, order);
  const paymentState = payment ? orderPaymentPresentation(payment, order) : null;
  return <SuppliersFrame company={company}>
    <div><Link href="/orders" className={buttonStyles({ variant: "ghost", size: "sm" })}><ArrowLeft size={16} aria-hidden />Volver a órdenes</Link></div>
    <PageHeader title="Orden de compra" description={order.product} actions={<OrderStatus order={order} />}
      className="[&>div]:min-w-0 [&_p]:break-words" />
    {order.quote_source === "example" && <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
      <FlaskConical size={12} aria-hidden /> Ejemplo: esta orden viene de una cotización de muestra.<span className="sr-only"> (datos de prueba)</span></p>}
    <Card className="space-y-5"><h2 className="text-base font-bold">Cotización elegida</h2>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <Datum label="Proveedor">{order.quote_source === "example" ? order.supplier_name
          : <Link href={`/suppliers/${order.supplier_contact_id}`} className="underline underline-offset-4">{order.supplier_name}</Link>}</Datum>
        <Datum label="Cantidad">{order.quantity.toLocaleString("es-AR")} {order.unit || "unidades"}</Datum>
        <Datum label="Origen">{order.quote_source === "example" ? "Datos de prueba" : order.quote_source === "call" ? "Registro de llamada" : "Fuente web"}</Datum>
        <Datum label="Precio unitario cotizado"><span className="break-all">{formatOrderQuoted(order.quoted_unit_price, order.quoted_currency)}</span></Datum>
        <Datum label="Total cotizado"><span className="break-all">{formatOrderQuoted(order.quoted_total, order.quoted_currency)}</span></Datum>
        <Datum label="Orden actualizada · Argentina">{date.format(new Date(order.updated_at))}</Datum>
      </dl>
    </Card>
    <Card className="space-y-5"><h2 className="text-base font-bold">Importe y datos de cobro de la orden</h2>
      <dl className="grid gap-5 sm:grid-cols-2">
        <Datum label="Importe de liquidación ARGt">{order.amount_atomic ? <span className="break-all">{formatOrderArgt(order.amount_atomic)}</span> : "Conversión pendiente"}</Datum>
        <Datum label="Red de cobro">{order.wallet ? chains[order.wallet.chain] : "Billetera pendiente"}</Datum>
        <Datum label="Dirección de cobro">{order.wallet ? <span className="break-all font-mono">{order.wallet.address}</span> : "Sin dirección registrada en la orden"}</Datum>
        <Datum label="Versión de billetera registrada">{order.wallet_version}</Datum>
      </dl>
      {order.quoted_currency === "ARS" && order.pricing_status === "ready" && <Alert tone="info">
        Equivalencia nominal del MVP: 1 ARS = 1 ARGt. No es una cotización de cambio de mercado.
      </Alert>}
      {order.pricing_status === "pending_conversion" && <Alert tone="info">El precio cotizado conserva su moneda. El importe ARGt requiere una conversión antes de aprobar el pago.</Alert>}
      {order.approved_at && <p className="text-xs text-ink-muted">Aprobada por una persona · {date.format(new Date(order.approved_at))}, horario de Argentina.</p>}
    </Card>
    <Card className="space-y-4"><h2 className="text-base font-bold">Estado del pago</h2>
      {paymentLookupFailed ? <Alert tone="warning" title="Estado no disponible">No se pudo consultar el estado del pago. Volvé a consultar antes de realizar otra acción.</Alert>
        : verifiedDemoPayment ? <><Badge tone={verifiedDemoPayment.status === "confirmed" ? "success" : "warning"}>{verifiedDemoPayment.status === "confirmed" ? "Demo confirmada" : "Demo en verificación"}</Badge><p className="text-sm text-ink-muted">Transferencia de prueba con datos ficticios.</p></>
        : paymentState ? <><Badge tone={paymentState.tone}>{paymentState.label}</Badge><p className="text-sm text-ink-muted">{paymentState.description}</p></>
        : <><Badge>Pago pendiente</Badge><p className="text-sm text-ink-muted">{paymentAvailable ? "Todavía no hay una confirmación de pago para esta orden." : "La consulta de pagos estará disponible cuando se conecte el servicio de pagos."}</p></>}
      {verifiedPayment?.tx_hash && verifiedPayment.explorer_url && <a href={verifiedPayment.explorer_url} target="_blank" rel="noreferrer"
        className="block break-all font-mono text-xs font-bold underline underline-offset-4">{verifiedPayment.tx_hash}</a>}
    </Card>
    {(demoPaymentAvailable || verifiedDemoPayment) && !paymentLookupFailed && <Card><DemoPaymentActions order={order} payment={verifiedDemoPayment} enabled={demoPaymentAvailable} /></Card>}
    <PurchaseOrderActions key={order.id} order={order} payment={payment} paymentAvailable={paymentAvailable && !paymentLookupFailed} />
  </SuppliersFrame>;
}

export function PurchaseOrderAccessState({ code, message }: { code: ErrorCode; message?: string }) {
  const session = code === "FORBIDDEN" || (code === "VALIDATION_ERROR" && /seleccion.*empresa/i.test(message ?? ""));
  return <SuppliersFrame><PageHeader title="Órdenes de compra" />
    <Alert tone={session || code === "NOT_FOUND" || code === "VALIDATION_ERROR" ? "warning" : "danger"}
      title={session ? "Elegí una empresa para ver sus órdenes" : code === "NOT_FOUND" ? "Esta orden no está disponible" : "No pudimos cargar la orden"}>
      {session ? "Iniciá sesión y seleccioná la empresa con la que querés trabajar." : message ?? "Volvé a la lista de órdenes de la empresa activa."}
    </Alert>
    <div><Link href={session ? "/login/companies" : "/orders"} className={buttonStyles({ variant: "secondary" })}>{session ? "Seleccionar empresa" : "Ver órdenes"}</Link></div>
  </SuppliersFrame>;
}
