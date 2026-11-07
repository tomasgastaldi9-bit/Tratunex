import { Download, PhoneOutgoing } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { getPurchaseRequest } from "@/features/agent/server/public";
import { listSuppliers } from "@/features/crm/server/public";
import { getCompanyContext } from "@/features/platform/server/public";
import type { BeloPrice } from "@/contracts/voice";
import { beloEquivalent } from "@/features/voice/server/belo-price";
import { getBeloPrice, listSupplierQuotes } from "@/features/voice/server/public";
import type { ComparatorQuote } from "@/features/voice/server/quote-import";
import { importQuoteAction, requestQuoteCallAction } from "./actions";

type PageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Solo se muestran mensajes propios: la URL trae un código, no texto.
const ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Revisá el ID de la llamada, el proveedor y la compra. Si en la llamada no habló una persona, no hay cotización.",
  NOT_FOUND: "Vapi no tiene una llamada con ese ID. Copialo de nuevo desde Logs → Calls.",
  CONFLICT_RETRY: "La llamada todavía no terminó o Vapi está armando la cotización. Probá de nuevo en unos segundos.",
  CONFLICT: "Esa llamada ya está asociada a otro proveedor o a otra compra.",
  FORBIDDEN: "Esa llamada es de otra empresa o tu sesión venció.",
  PROVIDER_ERROR: "Vapi rechazó la consulta. Revisá VAPI_PRIVATE_KEY en el servidor.",
  PROVIDER_UNAVAILABLE: "Vapi o la base no respondieron, o falta configuración del servidor. Probá de nuevo.",
  RATE_LIMITED: "Vapi pidió esperar un momento. Probá de nuevo en unos segundos.",
};

const CALL_ERRORS: Record<string, string> = {
  VALIDATION_ERROR: "Elegí un proveedor y abrí esta página desde una compra.",
  NOT_FOUND: "No encontramos el proveedor, la compra o el asistente de Vapi configurado.",
  FORBIDDEN: "El proveedor pidió que no lo llamen, o tu sesión venció.",
  CONFLICT: "Ese pedido de llamada ya se intentó: recargá la página y revisá en Vapi antes de volver a llamar.",
  PROVIDER_ERROR: "Vapi rechazó la llamada. Revisá el teléfono del proveedor, el crédito y la configuración del servidor.",
  PROVIDER_UNAVAILABLE: "Vapi no respondió o falta configuración del servidor (VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID). Revisá en Vapi si la llamada salió antes de reintentar.",
  RATE_LIMITED: "Vapi pidió esperar un momento. Probá de nuevo en unos segundos.",
};

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

const pesos = (value: number) => `$ ${value.toLocaleString("es-AR", { maximumFractionDigits: 2 })}`;
const usdt = (value: number) => `${value.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
const hour = (iso: string) =>
  new Date(iso).toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" });

// Total de la compra con el precio de la cotización, en pesos y USDT según Belo.
function BeloLine({ quote, quantity, price }: { quote: ComparatorQuote; quantity: number | null; price: BeloPrice | null }) {
  if (!quote.unit_price || !price) return null;
  const unit = Number(quote.unit_price.amount_atomic) / 10 ** quote.unit_price.decimals;
  const each = beloEquivalent(unit, quote.unit_price.currency, price);
  const total = quantity ? beloEquivalent(unit * quantity, quote.unit_price.currency, price) : null;
  return (
    <p>
      Según Belo: {pesos(each.ars)} ≈ {usdt(each.usdt)} por unidad
      {total && <> · total por {quantity!.toLocaleString("es-AR")}: <strong>{pesos(total.ars)} ≈ {usdt(total.usdt)}</strong></>}
    </p>
  );
}

function formatPrice(quote: ComparatorQuote): string {
  if (!quote.unit_price) return "Sin precio";
  const amount = Number(quote.unit_price.amount_atomic) / 10 ** quote.unit_price.decimals;
  const text = amount.toLocaleString("es-AR", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const vat = quote.price_includes_vat === "yes" ? " con IVA" : quote.price_includes_vat === "no" ? " + IVA" : "";
  return `${quote.unit_price.currency === "USD" ? "US$" : "$"} ${text}${vat}`;
}

function SourceBadge({ quote }: { quote: ComparatorQuote }) {
  if (quote.source.kind === "call") {
    return <Badge tone={quote.source.transport === "phone" ? "success" : "neutral"}>{quote.source.transport === "phone" ? "Llamada real" : "Llamada web"}</Badge>;
  }
  if (quote.source.kind === "web") return <Badge tone="neutral">Precio web</Badge>;
  return <Badge tone="warning">{quote.source.label}</Badge>;
}

export default async function ImportQuotePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok && (context.error.code === "FORBIDDEN" || context.error.code === "VALIDATION_ERROR")) {
    redirect("/login/companies");
  }
  if (!context.ok) {
    return (
      <AppShell>
        <Alert tone="danger" title="No pudimos comprobar tu acceso">Intentá de nuevo en unos segundos.</Alert>
      </AppShell>
    );
  }

  const purchaseParam = first(params.purchase_request_id);
  const purchaseId = purchaseParam && UUID.test(purchaseParam) ? purchaseParam : null;
  const [purchase, suppliers, quotes, belo] = await Promise.all([
    purchaseId ? getPurchaseRequest(context.data, { purchase_request_id: purchaseId }) : null,
    listSuppliers(context.data, { limit: 100 }),
    purchaseId ? listSupplierQuotes(context.data, { purchase_request_id: purchaseId }) : null,
    purchaseId ? getBeloPrice("USDT/ARS") : null,
  ]);
  const beloPrice = belo?.ok ? belo.data : null;
  const quantity = purchase?.ok ? purchase.data.purchase_request.quantity : null;
  const supplierOptions = suppliers.ok
    ? suppliers.data.items.map((s) => ({ value: s.id, label: s.organization ? `${s.organization} (${s.name})` : s.name }))
    : [];
  const supplierName = new Map(supplierOptions.map((option) => [option.value, option.label]));
  const errorCode = first(params.error);
  const callError = first(params.call_error);
  const calledParam = first(params.called);
  const called = calledParam && UUID.test(calledParam) ? calledParam : null;
  const supplierParam = first(params.supplier);
  const calledSupplier = supplierParam && UUID.test(supplierParam) ? supplierParam : undefined;
  const imported = first(params.imported);

  return (
    <AppShell>
      <PageHeader
        title="Traer cotización de una llamada"
        description="Después de que el cotizador llamó al proveedor, guardá lo que dijo para compararlo con las otras cotizaciones."
      />

      {errorCode && (
        <Alert tone="danger" title="No se pudo traer la cotización">
          {ERRORS[errorCode] ?? "Algo salió mal. Probá de nuevo."}
        </Alert>
      )}
      {callError && (
        <Alert tone="danger" title="No se pudo hacer la llamada">
          {CALL_ERRORS[callError] ?? "Algo salió mal. Revisá en Vapi si la llamada salió antes de reintentar."}
        </Alert>
      )}
      {called && !imported && (
        <Alert tone="success" title="Llamando al proveedor">
          El cotizador está llamando. Cuando corte, tocá <strong>Traer cotización</strong>: el formulario ya tiene la llamada y el proveedor.
        </Alert>
      )}
      {imported && (
        <Alert tone="success" title={imported === "new" ? "Cotización guardada" : "Esa llamada ya estaba guardada"}>
          Aparece en la lista de abajo y en el comparador de la compra.
        </Alert>
      )}

      <Card>
        {purchase?.ok ? (
          <p>
            Compra: <strong>{purchase.data.purchase_request.quantity.toLocaleString("es-AR")} {purchase.data.purchase_request.unit || "unidades"} de {purchase.data.purchase_request.product}</strong>
          </p>
        ) : (
          <Alert tone="warning" title="Falta la compra">
            Abrí esta página desde una compra, o pegá abajo su ID.
          </Alert>
        )}

        {purchase?.ok && (
          <form action={requestQuoteCallAction}>
            <input type="hidden" name="purchase_request_id" value={purchase.data.purchase_request.id} />
            {/* Uno por carga de la página: un doble clic no llama dos veces. */}
            <input type="hidden" name="click_id" value={crypto.randomUUID()} />
            <Select
              label="Llamar a un proveedor para pedirle cotización"
              name="supplier_contact_id"
              required
              placeholder={supplierOptions.length ? "Elegí un proveedor" : "No hay proveedores cargados"}
              options={supplierOptions}
            />
            <Button type="submit" variant="secondary" icon={PhoneOutgoing}>
              Llamar ahora
            </Button>
          </form>
        )}

        <form action={importQuoteAction}>
          {purchase?.ok ? (
            <input type="hidden" name="purchase_request_id" value={purchase.data.purchase_request.id} />
          ) : (
            <Input label="ID de la compra" name="purchase_request_id" required defaultValue={purchaseParam ?? ""} />
          )}
          <Select
            label="Proveedor al que llamó el cotizador"
            name="supplier_contact_id"
            required
            defaultValue={calledSupplier}
            placeholder={supplierOptions.length ? "Elegí un proveedor" : "No hay proveedores cargados"}
            options={supplierOptions}
          />
          <Input
            label="ID de la llamada en Vapi"
            name="provider_call_id"
            required
            hint="En Vapi: Logs → Calls → la llamada. Es un código como 01a1b71c-99fc-7001-…"
            autoComplete="off"
            defaultValue={called ?? undefined}
          />
          <Button type="submit" variant="primary" icon={Download}>
            Traer cotización
          </Button>
        </form>
      </Card>

      {purchaseId && (
        <section>
          <PageHeader as="h2" title="Cotizaciones de esta compra" />
          {beloPrice ? (
            <p>
              Dólar cripto en Belo (USDT/ARS): compra {pesos(beloPrice.bid)} · venta {pesos(beloPrice.ask)} · consultado a las {hour(beloPrice.fetched_at)}. Los equivalentes usan el precio medio y son de referencia.
            </p>
          ) : (
            belo && <Alert tone="warning" title="Sin precio de Belo">No pudimos consultar el precio de Belo; los montos se muestran solo en su moneda.</Alert>
          )}
          {!quotes?.ok ? (
            <Alert tone="danger" title="No pudimos leer las cotizaciones">Probá de nuevo en unos segundos.</Alert>
          ) : quotes.data.items.length === 0 ? (
            <EmptyState title="Todavía no hay cotizaciones" description="Traé la primera desde una llamada del cotizador." />
          ) : (
            <ul>
              {quotes.data.items.map((quote) => (
                <li key={quote.id}>
                  <Card>
                    <p>
                      <strong>{supplierName.get(quote.supplier_contact_id) ?? "Proveedor"}</strong> · {formatPrice(quote)} <SourceBadge quote={quote} />
                    </p>
                    <p>
                      Stock: {quote.available_quantity ?? "sin dato"} · Plazo: {quote.lead_time_days !== null ? `${quote.lead_time_days} días` : quote.lead_time_text ?? "sin dato"} · Acepta ARGt: {quote.accepts_argt === "yes" ? "sí" : quote.accepts_argt === "no" ? "no" : "sin dato"}
                    </p>
                    <BeloLine quote={quote} quantity={quantity} price={beloPrice} />
                    <p>{quote.summary}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href={`/orders/quotes?purchase_request_id=${purchaseId}`}>Abrir el comparador de esta compra</Link>
          </p>
        </section>
      )}
    </AppShell>
  );
}
