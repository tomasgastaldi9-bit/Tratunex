import Link from "next/link";
import { ArrowRight, FileText, FlaskConical, Globe, MessageSquareText, Star } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Badge } from "../../../components/ui/Badge";
import { buttonStyles } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { EmptyState } from "../../../components/ui/EmptyState";
import { PageHeader } from "../../../components/ui/PageHeader";
import { ModeBadge } from "../../../components/ui/StatusBadges";
import type { ErrorCode } from "../../../contracts/common";
import type { QuoteRanking, SupplierQuote } from "../../../contracts/supplier-quotes";
import { formatQuoteMoney, quoteTotal, type QuoteComparison, type QuoteComparisonRow } from "../quote-comparison";
import { SuppliersFrame } from "./supplier-view";
import type { PurchaseChoicesPage } from "../server/purchase-picker-service";
import { CreatePurchaseOrderButton } from "./purchase-order-create-button";

type Company = { id: string; name: string; industry?: string | null };
const number = (value: number) => value.toLocaleString("es-AR");
const answers = { yes: "Sí", no: "No", unknown: "Sin confirmar" };

function totalFor(quote: SupplierQuote, quantity: number) {
  if (!quote.unit_price) return "Total pendiente";
  try { return formatQuoteMoney(quoteTotal(quote.unit_price, quantity)); }
  catch { return "Total fuera de rango"; }
}

function QuoteSource({ quote, mode }: { quote: SupplierQuote; mode: QuoteComparison["mode"] }) {
  const source = quote.source;
  if (source.kind === "example" || mode === "example") return <div className="space-y-2">
    <Badge tone="warning" icon={FlaskConical}>Datos de prueba</Badge>
    <p className="break-words text-xs text-ink-muted">{source.kind === "example" ? source.label : "Origen ilustrativo"}</p>
  </div>;
  if (source.kind === "web") return <div className="space-y-2"><Badge icon={Globe}>Web</Badge>
    <a href={source.url} target="_blank" rel="noreferrer" className="block break-all text-xs font-bold underline underline-offset-4">Consultar fuente web</a></div>;
  const modeBadge = source.transport === "phone" ? "live" : source.transport;
  const label = source.transport === "phone" ? "Ver llamada telefónica" : source.transport === "web" ? "Ver registro de voz web" : "Ver llamada de prueba";
  return <div className="space-y-2 [&_span]:max-w-full [&_span]:whitespace-normal"><ModeBadge mode={modeBadge} />
    <Link href={`/calls/${source.call_id}`} className="block text-xs font-bold underline underline-offset-4">{label}</Link></div>;
}

function QuotePrice({ quote, quantity, unit }: { quote: SupplierQuote; quantity: number; unit: string }) {
  const vat = { yes: "IVA incluido", no: "IVA aparte", unknown: "IVA sin confirmar" };
  return <div className="space-y-2">
    <p className="break-all font-bold tabular-nums">{quote.unit_price ? formatQuoteMoney(quote.unit_price) : "Precio pendiente"}</p>
    <p className="text-xs text-ink-muted">Por {unit || "unidad"} · {vat[quote.price_includes_vat]}</p>
    <div className="border-t border-line pt-2"><p className="text-xs text-ink-muted">Total por {number(quantity)} {unit || "unidades"}</p>
      <p className="mt-1 break-all font-bold tabular-nums">{totalFor(quote, quantity)}</p></div>
  </div>;
}

function QuoteStock({ quote }: { quote: SupplierQuote }) {
  const labels = { yes: "Stock confirmado", partial: "Stock parcial", no: "Sin stock", unknown: "Stock sin confirmar" };
  return <div className="space-y-2"><Badge tone={quote.can_supply === "no" ? "warning" : "neutral"} className="max-w-full"><span className="whitespace-normal">{labels[quote.can_supply]}</span></Badge>
    <p className="text-xs text-ink-muted">Disponible: {quote.available_quantity === null ? "sin confirmar" : number(quote.available_quantity)}</p>
    {quote.minimum_order_quantity !== null && <p className="text-xs text-ink-muted">Mínimo de pedido: {number(quote.minimum_order_quantity)}</p>}
  </div>;
}

function QuoteDelivery({ quote }: { quote: SupplierQuote }) {
  const delivery = { yes: "Entrega incluida", no: "Entrega aparte", unknown: "Costo de entrega sin confirmar" };
  return <div className="space-y-2"><p className="font-bold">{quote.lead_time_days === null ? "Plazo pendiente" : quote.lead_time_days === 0 ? "Entrega en el día" : `${quote.lead_time_days} ${quote.lead_time_days === 1 ? "día" : "días"}`}</p>
    {quote.lead_time_text && <p className="break-words text-xs text-ink-muted">{quote.lead_time_text}</p>}
    <p className="text-xs text-ink-muted">{delivery[quote.delivery_included]}</p>
    {quote.payment_terms && <p className="break-words text-xs text-ink-muted">Pago: {quote.payment_terms}</p>}
  </div>;
}

function SupplierName({ row, mode }: { row: QuoteComparisonRow; mode: QuoteComparison["mode"] }) {
  return <div className="min-w-0 space-y-2">
    {mode === "persisted" ? <Link href={`/suppliers/${row.supplier.id}`} className="block break-words font-bold underline underline-offset-4">{row.supplier.name}</Link>
      : <p className="break-words font-bold">{row.supplier.name}</p>}
    {row.supplier.organization && <p className="break-words text-xs text-ink-muted">{row.supplier.organization}</p>}
    <details className="text-xs"><summary className="cursor-pointer font-bold">Detalle de la cotización</summary>
      <p className="mt-2 break-words leading-relaxed text-ink-muted">{row.quote.summary}</p>
      {row.quote.notes && <p className="mt-2 break-words leading-relaxed text-ink-muted">{row.quote.notes}</p>}
    </details>
  </div>;
}

function Recommendation({ comparison }: { comparison: QuoteComparison }) {
  const recommendation = comparison.recommendation;
  if (recommendation.status === "pending") return <Alert tone="info" title="Recomendación pendiente">{recommendation.message}</Alert>;
  if (recommendation.status === "error") return <Alert tone="warning" title="No pudimos obtener la recomendación">{recommendation.error.message}</Alert>;
  const supplier = comparison.rows.find(row => row.quote.id === recommendation.data.recommended_quote_id)?.supplier;
  return <Card className="space-y-3 border border-ink">
    <div className="flex flex-wrap items-center gap-3"><Badge tone="strong" icon={Star}>{comparison.mode === "example" ? "Recomendación ilustrativa" : supplier ? "Proveedor recomendado" : "Sin proveedor recomendado"}</Badge>
      {comparison.mode === "persisted" && <Badge>{recommendation.data.explanation_source === "ai" ? "IA" : "Reglas"}</Badge>}
      {supplier && <p className="min-w-0 break-words font-bold">{supplier.name}</p>}</div>
    <p className="break-words text-sm leading-relaxed">{recommendation.data.explanation}</p>
    <p className="text-xs text-ink-muted">La evaluación compara las cotizaciones; la orden y su aprobación se revisan por separado.</p>
  </Card>;
}

function RankingEvaluation({ item, fallback }: { item?: QuoteRanking["ranking"][number]; fallback: string }) {
  if (!item) return <p className="break-words leading-relaxed">{fallback}</p>;
  const policy = item.policy;
  const decisions = { auto_pay: "Dentro de la política", needs_approval: "Requiere aprobación", rejected: "Fuera de la política" };
  return <div className="space-y-3">
    <div className="flex flex-wrap gap-2"><Badge>Posición {item.position}</Badge>
      <Badge tone={item.eligible ? "info" : "warning"}>{item.eligible ? "Califica en el ranking" : "No califica en el ranking"}</Badge></div>
    {item.reasons.length > 0 ? <ul className="list-disc space-y-2 pl-4">{item.reasons.map((reason, index) => <li key={index} className="break-words leading-relaxed">{reason}</li>)}</ul>
      : <p className="text-xs text-ink-muted">Sin motivos adicionales.</p>}
    {policy && <p className="break-words text-xs text-ink-muted">{decisions[policy.decision]}: {policy.reason}</p>}
  </div>;
}

function CreateOrderAction({ companyId, row, mode }: { companyId: string; row: QuoteComparisonRow; mode: QuoteComparison["mode"] }) {
  if (mode !== "persisted" || row.quote.source.kind === "example") return null;
  return <div className="[&_button]:w-full [&_button]:whitespace-normal [&_button]:leading-snug [&_svg]:shrink-0">
    <CreatePurchaseOrderButton companyId={companyId} supplierQuoteId={row.quote.id} />
  </div>;
}

export function QuoteComparisonView({ company, comparison }: { company: Company; comparison: QuoteComparison }) {
  const { purchase, recommendation, rows, mode } = comparison;
  const ready = recommendation.status === "ready";
  const recommendedId = ready ? recommendation.data.recommended_quote_id : null;
  const rankings = new Map(ready ? recommendation.data.ranking.map(item => [item.quote_id, item]) : []);
  const fallback = recommendation.status === "pending" ? "Motivo pendiente de la recomendación."
    : recommendation.status === "error" ? "La evaluación no está disponible." : "Sin evaluación disponible para esta cotización.";
  return <SuppliersFrame company={company}>
    <PageHeader title="Comparar cotizaciones" description="Revisá precios, stock, plazos y condiciones para esta compra."
      actions={<Link href={mode === "example" ? "/orders/quotes" : "/suppliers"} className={buttonStyles({ variant: "ghost" })}>
        {mode === "example" ? "Comparar una compra" : "Ver proveedores"}<ArrowRight size={16} aria-hidden /></Link>} />
    {mode === "example" && <Alert tone="warning" title="Datos de prueba · comparación ilustrativa, sin IA ejecutada">
      Los proveedores, precios y motivos de esta vista son ficticios.</Alert>}
    <Card className="space-y-4"><h2 className="break-words text-lg font-bold">{purchase.product}</h2>
      <dl className="grid gap-4 text-sm sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-xs text-ink-muted">Cantidad solicitada</dt><dd className="mt-1 break-words font-bold">{number(purchase.quantity)} {purchase.unit || "unidades"}</dd></div>
        <div><dt className="text-xs text-ink-muted">Fecha de entrega solicitada</dt><dd className="mt-1 font-bold">{purchase.needed_by.split("-").reverse().join("/")}</dd></div>
        <div className="min-w-0"><dt className="text-xs text-ink-muted">Presupuesto declarado</dt><dd className="mt-1 break-all font-bold">{formatQuoteMoney({ amount_atomic: purchase.budget_atomic, currency: "ARGt", decimals: 18 })}</dd></div>
        <div><dt className="text-xs text-ink-muted">Zona de entrega</dt><dd className="mt-1 break-words font-bold">{purchase.zone || "Sin definir"}</dd></div>
      </dl>
    </Card>
    <Recommendation comparison={comparison} />
    {comparison.quotes_status === "pending" && <Alert tone="info" title="Cotizaciones pendientes">La comparación se completará cuando estén disponibles las cotizaciones de esta compra.</Alert>}
    {!rows.length ? <EmptyState icon={MessageSquareText} title={comparison.quotes_status === "pending" ? "Esperando cotizaciones" : "Todavía no hay cotizaciones para esta compra"}
      description="Los precios, la disponibilidad y las condiciones aparecerán acá cuando se registren las cotizaciones." /> : <>
      <div className="flex flex-wrap items-end justify-between gap-3"><h2 className="text-base font-bold">Cotizaciones disponibles</h2>
        <p className="text-xs text-ink-muted">{rows.length} {rows.length === 1 ? "cotización" : "cotizaciones"} · Totales para {number(purchase.quantity)} {purchase.unit || "unidades"}</p></div>
      <p className="text-xs text-ink-muted">Cada precio conserva su moneda. El ranking usa la equivalencia nominal de 1 ARS = 1 ARGt; los precios en USD quedan sin conversión. Revisá IVA, entrega y mínimos de pedido.</p>
      <div role="region" aria-label="Tabla comparativa de cotizaciones" tabIndex={0}
        className="hidden min-w-0 overflow-x-auto rounded-card border border-line focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink xl:block">
        <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
          <caption className="sr-only">Comparación de proveedores para {purchase.product}: precio, stock, plazo, aceptación de ARGt, origen y motivo.</caption>
          <colgroup><col className="w-[18%]" /><col className="w-[16%]" /><col className="w-[12%]" /><col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[14%]" /><col className="w-[18%]" /></colgroup>
          <thead className="bg-surface"><tr>{["Proveedor", "Precio y total", "Stock", "Entrega y condiciones", "Acepta ARGt", "Origen", "Evaluación"].map(label => <th key={label} scope="col" className="p-4 align-top text-xs font-bold">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => {
            const selected = row.quote.id === recommendedId;
            return <tr key={row.quote.id} data-recommended={selected ? "true" : undefined} className={`border-t border-line ${selected ? "bg-info-soft/40" : ""}`}>
              <th scope="row" className="p-4 align-top font-normal"><SupplierName row={row} mode={mode} />
                {selected && <Badge tone="info" icon={Star} className="mt-3">{mode === "example" ? "Ejemplo recomendado" : "Recomendado"}</Badge>}</th>
              <td className="p-4 align-top"><QuotePrice quote={row.quote} quantity={purchase.quantity} unit={purchase.unit} /></td>
              <td className="p-4 align-top"><QuoteStock quote={row.quote} /></td>
              <td className="p-4 align-top"><QuoteDelivery quote={row.quote} /></td>
              <td className="p-4 align-top"><Badge tone={row.quote.accepts_argt === "unknown" ? "warning" : "neutral"} className="max-w-full"><span className="whitespace-normal">{answers[row.quote.accepts_argt]}</span></Badge></td>
              <td className="p-4 align-top"><QuoteSource quote={row.quote} mode={mode} /></td>
              <td className="space-y-4 p-4 align-top"><RankingEvaluation item={rankings.get(row.quote.id)} fallback={fallback} />
                <CreateOrderAction companyId={company.id} row={row} mode={mode} /></td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      <section aria-label="Cotizaciones en tarjetas" className="grid min-w-0 gap-5 lg:grid-cols-2 xl:hidden">{rows.map(row => {
        const selected = row.quote.id === recommendedId;
        return <Card key={row.quote.id} data-recommended={selected ? "true" : undefined} className={`min-w-0 space-y-5 border ${selected ? "border-ink" : "border-transparent"}`}>
          <SupplierName row={row} mode={mode} />
          {selected && <Badge tone="strong" icon={Star}>{mode === "example" ? "Ejemplo recomendado" : "Recomendado"}</Badge>}
          <dl className="grid min-w-0 gap-5 sm:grid-cols-2">
            <div className="min-w-0"><dt className="mb-2 text-xs font-bold">Precio y total</dt><dd><QuotePrice quote={row.quote} quantity={purchase.quantity} unit={purchase.unit} /></dd></div>
            <div className="min-w-0"><dt className="mb-2 text-xs font-bold">Stock</dt><dd><QuoteStock quote={row.quote} /></dd></div>
            <div className="min-w-0"><dt className="mb-2 text-xs font-bold">Entrega y condiciones</dt><dd><QuoteDelivery quote={row.quote} /></dd></div>
            <div className="min-w-0"><dt className="mb-2 text-xs font-bold">Acepta ARGt</dt><dd>{answers[row.quote.accepts_argt]}</dd></div>
            <div className="min-w-0"><dt className="mb-2 text-xs font-bold">Origen</dt><dd><QuoteSource quote={row.quote} mode={mode} /></dd></div>
          </dl>
          <div className="space-y-3 border-t border-line pt-4"><h3 className="text-xs font-bold">Evaluación</h3><RankingEvaluation item={rankings.get(row.quote.id)} fallback={fallback} /></div>
          <CreateOrderAction companyId={company.id} row={row} mode={mode} />
        </Card>;
      })}</section>
    </>}
  </SuppliersFrame>;
}

export function QuoteComparisonAccessState({ code, message }: { code: ErrorCode; message?: string }) {
  const session = code === "FORBIDDEN" || (code === "VALIDATION_ERROR" && /seleccion.*empresa/i.test(message ?? ""));
  const missing = code === "NOT_FOUND";
  return <SuppliersFrame><PageHeader title="Comparar cotizaciones" />
    <Alert tone={session || code === "VALIDATION_ERROR" || missing ? "warning" : "danger"}
      title={session ? "Elegí una empresa para comparar sus compras" : missing ? "Esta compra no está disponible" : code === "VALIDATION_ERROR" ? "Revisá la solicitud de compra" : "No pudimos cargar la comparación"}>
      {session ? "Iniciá sesión y seleccioná la empresa con la que querés trabajar."
        : missing ? "Consultá una solicitud de compra de la empresa activa."
          : message ?? "Revisá la solicitud y volvé a intentar cuando la información esté disponible."}
    </Alert>
    <div><Link href={session ? "/login/companies" : "/orders/quotes"} className={buttonStyles({ variant: "secondary" })}>{session ? "Seleccionar empresa" : "Elegir una compra"}</Link></div>
  </SuppliersFrame>;
}

export function QuoteComparisonStart({ company, purchases }: { company: Company; purchases?: PurchaseChoicesPage }) {
  return <SuppliersFrame company={company}>
    <PageHeader title="Comparar cotizaciones" description="Elegí una compra guardada para revisar las ofertas de sus proveedores."
      actions={<Link href="/purchases/new" className={buttonStyles({ variant: "secondary" })}>Nueva compra<ArrowRight size={16} aria-hidden /></Link>} />
    {purchases?.items.length ? <section aria-label="Compras para comparar" className="space-y-4">
      <h2 className="text-base font-bold">Compras de tu empresa</h2>
      <ul className="space-y-3">{purchases.items.map(purchase => <li key={purchase.id}><Card className="space-y-4">
        <div className="min-w-0"><h3 className="break-words text-base font-bold">{purchase.product}</h3>
          <p className="mt-2 break-words text-sm text-ink-muted">{purchase.quantity.toLocaleString("es-AR")} {purchase.unit || "unidades"} · Para el {purchase.needed_by.split("-").reverse().join("/")}</p></div>
        <div className="flex flex-wrap gap-3">
          <Link href={`/orders/quotes?purchase_request_id=${purchase.id}`} className={buttonStyles({ variant: "primary" })}
            aria-label={`Comparar cotizaciones de ${purchase.product}`}>Comparar cotizaciones<ArrowRight size={16} aria-hidden /></Link>
          <Link href={`/calls/quotes/import?purchase_request_id=${purchase.id}`} prefetch={false} className={buttonStyles({ variant: "secondary" })}
            aria-label={`Solicitar cotizaciones de ${purchase.product}`}>Solicitar cotizaciones</Link>
        </div>
      </Card></li>)}</ul>
    </section> : <EmptyState icon={FileText} title={purchases && purchases.page > 0 ? "No hay más compras en esta página" : "Elegí una compra para comparar"}
      description="La comparación se abre desde una solicitud de compra guardada."
      action={<Link href="/purchases/new" className={buttonStyles({ variant: "primary" })}>Crear una compra<ArrowRight size={16} aria-hidden /></Link>} />}
    {purchases && (purchases.page > 0 || purchases.has_next) && <nav aria-label="Páginas de compras" className="flex flex-wrap items-center gap-3">
      {purchases.page > 0 && <Link href={`/orders/quotes?page=${purchases.page - 1}`} className={buttonStyles({ variant: "secondary" })}>Página anterior</Link>}
      <span className="text-xs text-ink-muted">Página {purchases.page + 1}</span>
      {purchases.has_next && <Link href={`/orders/quotes?page=${purchases.page + 1}`} className={buttonStyles({ variant: "secondary" })}>Más compras<ArrowRight size={16} aria-hidden /></Link>}
    </nav>}
    {purchases?.limit_reached && <Alert tone="info">Mostramos el máximo de compras de esta lista. Las anteriores siguen guardadas.</Alert>}
    <div><Link href="/orders/quotes/example" className={buttonStyles({ variant: "ghost" })}><FlaskConical size={16} aria-hidden />Ver comparación de ejemplo</Link></div>
    <p className="text-xs text-ink-muted">El ejemplo usa datos de prueba y una explicación ilustrativa.</p>
  </SuppliersFrame>;
}
