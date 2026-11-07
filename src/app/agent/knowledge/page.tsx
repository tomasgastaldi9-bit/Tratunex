import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { KnowledgeEditor } from "@/features/agent/components/KnowledgeEditor";
import { readSavedNotice } from "@/features/agent/components/profile-form-data";
import { getAgentProfile } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * /agent/knowledge: la base de conocimiento del agente (productos, precios
 * orientativos y preguntas frecuentes).
 *
 * Es un componente del SERVIDOR: lee la versión vigente y le pasa al editor
 * (que sí corre en el navegador) solo datos simples. Sigue el mismo camino
 * que /agent/profile.
 */
export const metadata: Metadata = {
  title: "Base de conocimiento · Tratunex",
};

/** Lo que llega en la dirección después del "?" (por ejemplo, ?saved=3&created=1). */
type KnowledgePageProps = {
  // En Next 16, searchParams es una Promise: hay que esperarla con await.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function KnowledgePage({ searchParams }: KnowledgePageProps) {
  const encabezado = (
    <PageHeader
      title="Base de conocimiento"
      description="Productos, precios orientativos y preguntas frecuentes que el agente puede usar en la llamada."
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

  // 2. La versión vigente. Si falla, no mostramos el editor vacío (parecería
  //    que no hay nada cargado): mostramos el error.
  const perfil = await getAgentProfile(contexto.data);
  if (!perfil.ok) {
    return (
      <>
        {encabezado}
        <Alert tone="danger" title={perfil.error.message} />
      </>
    );
  }

  const { current, can_edit } = perfil.data;

  // 3. Todavía no hay ninguna versión: el conocimiento se guarda DENTRO de
  //    una versión del agente, y toda versión necesita un perfil (README,
  //    decisión 9). Invitamos a completar el perfil primero; el botón solo si
  //    la persona puede hacerlo (es admin).
  if (current === null) {
    return (
      <>
        {encabezado}
        <EmptyState
          icon={Building2}
          title="Primero completá el perfil de empresa"
          description={
            can_edit
              ? "El conocimiento se guarda junto con el perfil del agente."
              : "Pedile a una persona admin que complete el perfil."
          }
          action={
            can_edit ? (
              <Link href="/agent/profile" className={buttonStyles()}>
                Completar perfil
              </Link>
            ) : undefined
          }
        />
      </>
    );
  }

  // 4. ¿Venimos de guardar? La acción redirige acá con ?saved=N&created=1 (o 0).
  //    readSavedNotice es la misma del perfil: los nombres de la dirección son iguales.
  const aviso = readSavedNotice(await searchParams);

  // Un action_id nuevo cada vez que se muestra la página: identifica ESTE
  // guardado para que, si se reintenta, no se guarde dos veces (README, "action_id").
  const actionId = crypto.randomUUID();

  return (
    <>
      {encabezado}

      {aviso?.created === true && (
        <Alert tone="success" title={`Guardamos la versión ${aviso.version}`}>
          {/* "Se va a usar" y no "ya la usa": las llamadas todavía no leen el
              conocimiento, y no prometemos algo que no está andando (AGENTS.md). */}
          Se va a usar en las próximas llamadas.
        </Alert>
      )}
      {aviso?.created === false && (
        <Alert tone="info" title="No había cambios">
          Seguís en la versión {aviso.version}.
        </Alert>
      )}

      {!can_edit && (
        <Alert tone="info" title="Solo una persona admin puede cambiar el conocimiento">
          Lo podés ver, pero no editar.
        </Alert>
      )}

      <KnowledgeEditor
        // key={actionId}: después de guardar, la acción redirige a esta misma
        // página y React reutilizaría el editor que ya estaba (con el action_id
        // viejo y la lista de antes). Como cada vez que se arma la página hay
        // un actionId nuevo, la key cambia y React arma un editor nuevo, con
        // la versión recién guardada y otro action_id.
        key={actionId}
        // null = esta versión es de antes de AGT-02 y nunca tuvo conocimiento: arranca vacía.
        initialItems={current.knowledge ?? []}
        baseVersion={current.version}
        actionId={actionId}
        canEdit={can_edit}
      />
    </>
  );
}
