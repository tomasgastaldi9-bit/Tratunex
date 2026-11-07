import { Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { getPurchaseRequest } from "@/features/agent/server/public";
import { listSuppliers } from "@/features/crm/server/public";
import { getCompanyContext } from "@/features/platform/server/public";
import { listSupplierQuotes } from "@/features/voice/server/public";
import type { ComparatorQuote } from "@/features/voice/server/quote-import";
import { importQuoteAction } from "./actions";

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

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
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
  const [purchase, suppliers, quotes] = await Promise.all([
    purchaseId ? getPurchaseRequest(context.data, { purchase_request_id: purchaseId }) : null,
    listSuppliers(context.data, { limit: 100 }),
    purchaseId ? listSupplierQuotes(context.data, { purchase_request_id: purchaseId }) : null,
  ]);
  const supplierOptions = suppliers.ok
    ? suppliers.data.items.map((s) => ({ value: s.id, label: s.organization ? `${s.organization} (${s.name})` : s.name }))
    : [];
  const supplierName = new Map(supplierOptions.map((option) => [option.value, option.label]));
  const errorCode = first(params.error);
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
      {imported && (
        <Alert tone="success" title={imported === "new" ? "Cotización guardada" : "Esa llamada ya estaba guardada"}>
          Aparece en la lista de abajo y en el comparador de la compra.
        </Alert>
      )}

      <Card className="flex max-w-2xl flex-col gap-5">
        {purchase?.ok ? (
          <p className="text-sm text-ink-muted">
            Compra: <strong className="font-semibold text-ink">{purchase.data.purchase_request.quantity.toLocaleString("es-AR")} {purchase.data.purchase_request.unit || "unidades"} de {purchase.data.purchase_request.product}</strong>
          </p>
        ) : (
          <Alert tone="warning" title="Falta la compra">
            Abrí esta página desde una compra, o pegá abajo su ID.
          </Alert>
        )}

        <form action={importQuoteAction} className="flex flex-col gap-5">
          {purchase?.ok ? (
            <input type="hidden" name="purchase_request_id" value={purchase.data.purchase_request.id} />
          ) : (
            <Input label="ID de la compra" name="purchase_request_id" required defaultValue={purchaseParam ?? ""} />
          )}
          <Select
            label="Proveedor al que llamó el cotizador"
            name="supplier_contact_id"
            required
            placeholder={supplierOptions.length ? "Elegí un proveedor" : "No hay proveedores cargados"}
            options={supplierOptions}
          />
          <Input
            label="ID de la llamada en Vapi"
            name="provider_call_id"
            required
            hint="En Vapi: Logs → Calls → la llamada. Es un código como 01a1b71c-99fc-7001-…"
            autoComplete="off"
          />
          <div className="flex justify-end border-t border-line pt-4">
            <Button type="submit" variant="primary" icon={Download}>
              Traer cotización
            </Button>
          </div>
        </form>
      </Card>

      {purchaseId && (
        <section className="flex flex-col gap-3">
          <PageHeader as="h2" title="Cotizaciones de esta compra" />
          {!quotes?.ok ? (
            <Alert tone="danger" title="No pudimos leer las cotizaciones">Probá de nuevo en unos segundos.</Alert>
          ) : quotes.data.items.length === 0 ? (
            <EmptyState title="Todavía no hay cotizaciones" description="Traé la primera desde una llamada del cotizador." />
          ) : (
            <ul className="flex flex-col gap-3">
              {quotes.data.items.map((quote) => (
                <li key={quote.id}>
                  <Card className="flex flex-col gap-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="font-semibold">{supplierName.get(quote.supplier_contact_id) ?? "Proveedor"}</p>
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold tabular-nums">{formatPrice(quote)}</span>
                        <SourceBadge quote={quote} />
                      </div>
                    </div>
                    <dl className="grid grid-cols-3 gap-4 border-y border-line py-3 text-sm">
                      <div className="flex flex-col gap-1">
                        <dt className="text-ink-muted">Stock</dt>
                        <dd className="font-medium">{quote.available_quantity ?? "Sin dato"}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-ink-muted">Plazo</dt>
                        <dd className="font-medium">{quote.lead_time_days !== null ? `${quote.lead_time_days} días` : quote.lead_time_text ?? "Sin dato"}</dd>
                      </div>
                      <div className="flex flex-col gap-1">
                        <dt className="text-ink-muted">Acepta ARGt</dt>
                        <dd className="font-medium">{quote.accepts_argt === "yes" ? "Sí" : quote.accepts_argt === "no" ? "No" : "Sin dato"}</dd>
                      </div>
                    </dl>
                    <p className="text-sm leading-relaxed text-ink-muted">{quote.summary}</p>
                  </Card>
                </li>
              ))}
            </ul>
          )}
          <p>
            <Link href={`/orders/quotes?purchase_request_id=${purchaseId}`} className={buttonStyles({ variant: "secondary" })}>
              Abrir el comparador de esta compra
            </Link>
          </p>
        </section>
      )}
    </AppShell>
  );
}
