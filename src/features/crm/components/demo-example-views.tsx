import { ArrowRight, FlaskConical, Wallet } from "lucide-react";
import Link from "next/link";
import { Avatar } from "../../../components/ui/Avatar";
import { Badge } from "../../../components/ui/Badge";
import { buttonStyles } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import { ListItem } from "../../../components/ui/ListItem";
import { PageHeader } from "../../../components/ui/PageHeader";
import { EXAMPLE_ORDERS, EXAMPLE_SUPPLIERS } from "../mocks/demo-examples";
import { SuppliersFrame } from "./supplier-view";

const pesos = new Intl.NumberFormat("es-AR", { style: "currency", currency: "ARS", maximumFractionDigits: 0 });

/** Línea chica común: rotula los datos de muestra y por qué aparecen. */
function DemoNotice({ what }: { what: string }) {
  return (
    <p className="flex items-center gap-1.5 text-xs text-ink-subtle">
      <FlaskConical size={12} aria-hidden /> {`Ejemplo: ${what} de muestra mientras se carga la base.`}
      <span className="sr-only"> (datos de prueba)</span>
    </p>
  );
}

/** Etiqueta chica y gris para cada elemento de muestra. */
function ExampleBadge() {
  return (
    <Badge icon={FlaskConical}>
      Ejemplo<span className="sr-only"> (datos de prueba)</span>
    </Badge>
  );
}

/** Proveedores de ejemplo (solo lectura), cuando falta la tabla de proveedores. */
export function SuppliersExampleView() {
  return (
    <SuppliersFrame>
      <PageHeader
        title="Proveedores"
        description="Contactos, fuentes y datos de cobro de los proveedores de tu empresa."
        actions={
          <Link href="/orders/quotes/example" className={buttonStyles({ variant: "secondary" })}>
            Ver comparación de ejemplo
          </Link>
        }
      />
      <DemoNotice what="proveedores" />
      <section aria-label="Proveedores de ejemplo" className="flex flex-col gap-3">
        <p className="text-sm text-ink-muted">{EXAMPLE_SUPPLIERS.length} proveedores de ejemplo</p>
        <ul className="flex flex-col gap-2.5">
          {EXAMPLE_SUPPLIERS.map((supplier) => (
            <li key={supplier.id}>
              <ListItem
                leading={<Avatar name={supplier.name.replace(" · ficticio", "")} />}
                title={supplier.name}
                subtitle={`${supplier.contact} · ${supplier.phone}`}
                meta={
                  <div className="flex min-w-0 flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <Badge>{supplier.source}</Badge>
                      {supplier.wallet ? (
                        <Badge tone="success" icon={Wallet}>
                          Billetera en {supplier.wallet.chain}
                        </Badge>
                      ) : (
                        <Badge tone="warning" icon={Wallet}>
                          Billetera pendiente
                        </Badge>
                      )}
                      <ExampleBadge />
                    </div>
                    <p className="text-xs text-ink-muted">Acepta ARGt: {supplier.accepts_argt}</p>
                    {supplier.wallet && (
                      <p className="max-w-xs font-mono text-xs break-all text-ink-muted">{supplier.wallet.address}</p>
                    )}
                  </div>
                }
              />
            </li>
          ))}
        </ul>
      </section>
    </SuppliersFrame>
  );
}

/** Órdenes de ejemplo (solo lectura), cuando falta la tabla de órdenes. */
export function OrdersExampleView() {
  return (
    <SuppliersFrame>
      <PageHeader title="Órdenes de compra" description="Revisá los datos de cada orden, su aprobación y el estado del pago." />
      <DemoNotice what="órdenes" />
      <ul className="flex flex-col gap-4">
        {EXAMPLE_ORDERS.map((order) => (
          <li key={order.id}>
            <Card className="flex flex-col gap-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-semibold">{order.product}</h2>
                  <p className="mt-1.5 text-sm text-ink-muted">
                    {order.supplier} · {order.quantity.toLocaleString("es-AR")} {order.unit}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="warning">{order.status}</Badge>
                  <ExampleBadge />
                </div>
              </div>
              <dl className="grid grid-cols-1 gap-4 border-y border-line py-3 text-sm sm:grid-cols-3">
                <div className="flex flex-col gap-1">
                  <dt className="text-ink-muted">Precio por unidad</dt>
                  <dd className="font-medium">{pesos.format(order.unit_price_ars)}</dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-ink-muted">Total</dt>
                  <dd className="font-medium">
                    {pesos.format(order.unit_price_ars * order.quantity)} ≈ {(order.unit_price_ars * order.quantity).toLocaleString("es-AR")} ARGt
                  </dd>
                </div>
                <div className="flex flex-col gap-1">
                  <dt className="text-ink-muted">Pago</dt>
                  <dd className="font-medium">Sin pagar: necesita tu aprobación</dd>
                </div>
              </dl>
              <div className="flex justify-end">
                <Link href="/orders/quotes/example" className={buttonStyles({ variant: "secondary", size: "sm" })}>
                  Ver la comparación que la eligió
                  <ArrowRight size={14} aria-hidden />
                </Link>
              </div>
            </Card>
          </li>
        ))}
      </ul>
    </SuppliersFrame>
  );
}
