import { Wallet } from "lucide-react";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import type { Ctx, Result } from "@/contracts/common";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { PolicyForm, type SupplierOption } from "@/features/agent/components/PolicyForm";
import { policyToFormValues, readPolicySaved } from "@/features/agent/components/policy-form-data";
import { getPurchasePolicy } from "@/features/agent/server/public";
import { listSuppliers } from "@/features/crm/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * /agent/rules: las reglas de pago del dueño (BUY-02). Hasta cuánto paga el
 * agente solo, cuál es el máximo por compra y a qué proveedores les puede pagar.
 *
 * Es un componente del SERVIDOR: lee las reglas y los proveedores del CRM y le
 * pasa al formulario (que sí corre en el navegador) solo datos simples.
 * Sigue el mismo camino que /agent/profile.
 */
export const metadata: Metadata = {
  title: "Reglas de pago · Tratunex",
};

/** Lo que llega en la dirección después del "?" (por ejemplo, ?saved=1). */
type RulesPageProps = {
  // En Next 16, searchParams es una Promise: hay que esperarla con await.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/** Cuántas páginas de 100 proveedores leemos como mucho (hasta 1.000 proveedores). */
const MAX_PAGINAS_PROVEEDORES = 10;

/**
 * Lee los PROVEEDORES del CRM (solo lectura) para elegir los permitidos: un
 * contacto común no es alguien a quien el agente pueda pagarle.
 * listSuppliers devuelve de a 100 como mucho, así que pedimos página por
 * página. ¿Por qué no solo la primera? Si un proveedor ya elegido quedara
 * afuera de la lista, al guardar se borraría sin que nadie lo note.
 */
async function leerProveedores(ctx: Ctx): Promise<Result<SupplierOption[]>> {
  const proveedores: SupplierOption[] = [];
  let cursor: string | null = null;

  for (let pagina = 0; pagina < MAX_PAGINAS_PROVEEDORES; pagina++) {
    const resultado = await listSuppliers(ctx, cursor ? { limit: 100, cursor } : { limit: 100 });
    if (!resultado.ok) return resultado;
    // Solo lo que hace falta mostrar: nombre, organización y si tiene
    // billetera de cobro (sin ella el agente no le puede pagar). Nada de teléfonos.
    for (const proveedor of resultado.data.items) {
      proveedores.push({
        id: proveedor.id,
        name: proveedor.name,
        organization: proveedor.organization,
        withoutWallet: proveedor.collection_wallet === null,
      });
    }
    cursor = resultado.data.next_cursor;
    if (cursor === null) break;
  }

  return { ok: true, data: proveedores };
}

export default async function RulesPage({ searchParams }: RulesPageProps) {
  const encabezado = (
    <PageHeader title="Reglas de pago" description="Hasta dónde puede pagar el agente solo y a quién." />
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

  // 2. Las reglas guardadas y los proveedores del CRM (las dos lecturas a la
  //    vez, para no esperar una y después la otra). Si alguna falla, no
  //    mostramos el formulario: parecería que no hay nada guardado (o que no
  //    hay proveedores) y al guardar se podría pisar algo. Mostramos el error.
  const [reglas, proveedores] = await Promise.all([
    getPurchasePolicy(contexto.data),
    leerProveedores(contexto.data),
  ]);
  if (!reglas.ok) {
    return (
      <>
        {encabezado}
        <Alert tone="danger" title={reglas.error.message} />
      </>
    );
  }
  if (!proveedores.ok) {
    return (
      <>
        {encabezado}
        <Alert tone="danger" title={proveedores.error.message} />
      </>
    );
  }

  const { policy, can_edit } = reglas.data;

  // 3. Todavía no hay reglas y esta persona no las puede cargar (no es admin):
  //    un formulario vacío y bloqueado no le sirve. Le contamos qué falta y
  //    quién lo puede hacer (igual que en el perfil).
  if (policy === null && !can_edit) {
    return (
      <>
        {encabezado}
        <EmptyState
          icon={Wallet}
          title="Todavía no hay reglas de pago"
          description="Pedile a una persona admin que las cargue."
        />
      </>
    );
  }

  // 4. ¿Venimos de guardar? La acción redirige acá con ?saved=1.
  const guardadas = readPolicySaved(await searchParams);

  // Un action_id nuevo cada vez que se muestra la página: identifica ESTE
  // guardado para que, si se reintenta, no se guarde dos veces (README, "action_id").
  const actionId = crypto.randomUUID();

  return (
    <>
      {encabezado}

      {guardadas && (
        <Alert tone="success" title="Guardamos las reglas">
          El agente las usa desde el próximo pago.
        </Alert>
      )}

      {!can_edit && (
        <Alert tone="info" title="Solo una persona admin puede cambiar las reglas de pago">
          Las podés ver, pero no cambiar.
        </Alert>
      )}

      <PolicyForm
        // key={actionId}: después de guardar, la acción redirige a esta misma
        // página y React reutilizaría el formulario que ya estaba (con el
        // action_id viejo). Con la key nueva, React arma un formulario nuevo,
        // con las reglas recién guardadas y otro action_id.
        key={actionId}
        initialValues={policyToFormValues(policy)}
        suppliers={proveedores.data}
        actionId={actionId}
        canEdit={can_edit}
      />
    </>
  );
}
