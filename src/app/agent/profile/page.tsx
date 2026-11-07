import type { Metadata } from "next";
import { Alert } from "@/components/ui/Alert";
import { PageHeader } from "@/components/ui/PageHeader";
import { DEFAULT_CALL_WINDOW, DEFAULT_TONE } from "@/contracts/agent";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { ProfileForm } from "@/features/agent/components/ProfileForm";
import type { ProfileFormValues } from "@/features/agent/components/profile-form-data";
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

/** Lee la versión guardada de la dirección. Solo acepta un número entero desde 1. */
function leerVersionGuardada(valor: string | string[] | undefined): number | null {
  if (typeof valor !== "string") return null;
  const numero = Number(valor);
  return Number.isSafeInteger(numero) && numero >= 1 ? numero : null;
}

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

  // 3. ¿Venimos de guardar? La acción redirige acá con ?saved=N&created=1 (o 0).
  const { saved, created } = await searchParams;
  const versionGuardada = leerVersionGuardada(saved);

  const { current, can_edit } = perfil.data;

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

      {versionGuardada !== null && created === "1" && (
        <Alert tone="success" title={`Guardamos la versión ${versionGuardada}`}>
          La próxima llamada ya la usa.
        </Alert>
      )}
      {versionGuardada !== null && created === "0" && (
        <Alert tone="info" title="No había cambios">
          Seguís en la versión {versionGuardada}.
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
