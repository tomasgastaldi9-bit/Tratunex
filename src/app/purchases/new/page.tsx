import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { formatPesos } from "@/contracts/purchases";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { PurchaseRequestForm } from "@/features/agent/components/PurchaseRequestForm";
import { formatNeededBy, formatQuantity, readCreatedPurchase } from "@/features/agent/components/purchase-form-data";
import { getPurchaseRequest } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * /purchases/new: la persona cuenta qué necesita comprar y el agente sale a
 * buscar proveedores (BUY-01).
 *
 * Es un componente del SERVIDOR: comprueba quién es y, si viene de crear una
 * compra, la lee de la base para mostrar el resumen. El formulario (que sí
 * corre en el navegador) es PurchaseRequestForm.
 */
export const metadata: Metadata = {
  title: "Nueva compra · Tratunex",
};

/** Lo que llega en la dirección después del "?" (por ejemplo, ?created=<id>). */
type NewPurchasePageProps = {
  // En Next 16, searchParams es una Promise: hay que esperarla con await.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function NewPurchasePage({ searchParams }: NewPurchasePageProps) {
  const encabezado = (
    <PageHeader
      title="Nueva compra"
      description="Contale al agente qué necesitás y él busca proveedores, pide cotizaciones y te recomienda el mejor."
    />
  );

  // 1. ¿Quién es y de qué empresa? (Una página no puede escribir cookies: readOnlyCookies.)
  const contexto = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!contexto.ok) {
    return (
      <>
        {encabezado}
        <AccessAlert code={contexto.error.code} />
      </>
    );
  }

  // 2. ¿Venimos de crear una compra? La acción redirige acá con ?created=<id>.
  //    No le creemos a la dirección: leemos la compra de la base y mostramos
  //    lo que está guardado de verdad (si no se puede leer, lo decimos).
  const idCreada = readCreatedPurchase(await searchParams);
  const creada = idCreada ? await getPurchaseRequest(contexto.data, { purchase_request_id: idCreada }) : null;

  // Un action_id nuevo cada vez que se muestra la página: identifica ESTA
  // compra para que, si se reintenta, no se cree dos veces (README, "action_id").
  const actionId = crypto.randomUUID();

  return (
    <>
      {encabezado}

      {creada?.ok === true && (
        <Alert tone="success" title="Creamos la compra">
          {/* dl = "lista de datos": cada dato con su nombre (dt) y su valor (dd).
              flex-wrap: en el celular, si el valor es largo, baja a otra línea. */}
          <dl className="flex flex-col gap-1">
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-bold">Producto:</dt>
              <dd>{creada.data.purchase_request.product}</dd>
            </div>
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-bold">Cantidad:</dt>
              <dd>{formatQuantity(creada.data.purchase_request.quantity, creada.data.purchase_request.unit)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-bold">Para cuándo:</dt>
              <dd>{formatNeededBy(creada.data.purchase_request.needed_by)}</dd>
            </div>
            <div className="flex flex-wrap gap-x-1.5">
              <dt className="font-bold">Presupuesto:</dt>
              <dd>{formatPesos(creada.data.purchase_request.budget_atomic)}</dd>
            </div>
          </dl>
        </Alert>
      )}
      {/* No pudimos leer la compra: no decimos "creamos" sin comprobarlo. */}
      {creada?.ok === false && <Alert tone="danger" title={creada.error.message} />}

      <PurchaseRequestForm
        // key={actionId}: después de crear, la acción redirige a esta misma
        // página y React reutilizaría el formulario que ya estaba (con el
        // action_id viejo y lo escrito antes). Con la key nueva, React arma un
        // formulario vacío con otro action_id, listo para cargar otra compra.
        key={actionId}
        actionId={actionId}
      />
    </>
  );
}
