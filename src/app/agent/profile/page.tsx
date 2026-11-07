import { Building2 } from "lucide-react";
import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_CALL_WINDOW, DEFAULT_TONE } from "@/contracts/agent";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { ProfileForm } from "@/features/agent/components/ProfileForm";
import { readSavedNotice, type ProfileFormValues } from "@/features/agent/components/profile-form-data";
import { getAgentProfile } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * /agent/profile: el perfil de empresa del agente (qué vende, a quién, cómo
 * habla y cuándo puede llamar).
 *
 * Es un componente del SERVIDOR: lee la versión vigente y le pasa al
 * formulario (que sí corre en el navegador) solo datos simples.
 */
export const metadata: Metadata = {
  title: "Perfil de empresa · Tratunex",
};

/** Lo que llega en la dirección después del "?" (por ejemplo, ?saved=3&created=1). */
type ProfilePageProps = {
  // En Next 16, searchParams es una Promise: hay que esperarla con await.
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ProfilePage({ searchParams }: ProfilePageProps) {
  const encabezado = (
    <PageHeader
      title="Perfil de empresa"
      description="Qué vende tu empresa, a quién, cómo habla el agente y cuándo puede llamar."
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

  // 2. La versión vigente. Si falla, no mostramos el formulario vacío
  //    (parecería que no hay nada guardado): mostramos el error.
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

  // 3. Todavía no hay perfil y esta persona no lo puede completar (no es admin):
  //    un formulario vacío y bloqueado no le sirve para nada. Le contamos qué
  //    falta y quién lo puede hacer. Sin botón: no hay nada que ella pueda hacer acá.
  if (current === null && !can_edit) {
    return (
      <>
        {encabezado}
        <EmptyState
          icon={Building2}
          title="Tu agente todavía no tiene perfil"
          description="Pedile a una persona admin que lo complete."
        />
      </>
    );
  }

  // 4. ¿Venimos de guardar? La acción redirige acá con ?saved=N&created=1 (o 0).
  //    readSavedNotice vive al lado de savedProfileUrl (la que arma esa dirección),
  //    así las dos usan siempre los mismos nombres.
  const aviso = readSavedNotice(await searchParams);

  // Con qué arranca el formulario: lo guardado o, la primera vez, vacío con
  // el tono y el horario por defecto del contrato.
  const valoresIniciales: ProfileFormValues = current?.profile ?? {
    industry: "",
    offering: "",
    target_customer: "",
    value_proposition: "",
    zone: "",
    tone: DEFAULT_TONE,
    call_window: DEFAULT_CALL_WINDOW,
  };

  // Un action_id nuevo cada vez que se muestra la página: identifica ESTE
  // guardado para que, si se reintenta, no se guarde dos veces (README, "action_id").
  const actionId = crypto.randomUUID();

  return (
    <>
      {encabezado}

      {aviso?.created === true && (
        <Alert tone="success" title={`Guardamos la versión ${aviso.version}`}>
          {/* "Se va a usar" y no "ya la usa": las llamadas todavía no leen el
              perfil, y no prometemos algo que no está andando (AGENTS.md). */}
          Se va a usar en las próximas llamadas.
        </Alert>
      )}
      {aviso?.created === false && (
        <Alert tone="info" title="No había cambios">
          Seguís en la versión {aviso.version}.
        </Alert>
      )}

      {!can_edit && (
        <Alert tone="info" title="Solo una persona admin puede cambiar el perfil">
          Lo podés ver, pero no editar.
        </Alert>
      )}

      <ProfileForm
        // key={actionId}: después de guardar, la acción redirige a esta misma
        // página y React reutilizaría el formulario que ya estaba (con el
        // action_id viejo y los valores de antes). Como cada vez que se arma la
        // página hay un actionId nuevo, la key cambia y React arma un
        // formulario nuevo, con la versión recién guardada y otro action_id.
        key={actionId}
        initialValues={valoresIniciales}
        baseVersion={current?.version ?? null}
        actionId={actionId}
        canEdit={can_edit}
      />
    </>
  );
}
