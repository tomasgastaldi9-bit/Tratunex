import { CircleCheck, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressCard } from "@/components/ui/ProgressCard";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { getAgentProfile, getPurchasePolicy } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * /agent: el resumen del agente. Muestra en qué versión está, qué falta
 * configurar y las secciones para entrar a cada una.
 *
 * Es un componente del SERVIDOR (no tiene "use client"): lee los datos antes
 * de mandar la página, así la persona nunca ve una pantalla a medio cargar.
 */
export const metadata: Metadata = {
  title: "Agente · Tratunex",
};

export default async function AgentPage() {
  const encabezado = (
    <PageHeader
      title="Agente"
      description="Lo que tu agente sabe de tu empresa y cómo habla en cada llamada."
      actions={
        // Cualquier miembro puede crear una compra: el botón va siempre.
        <Link href="/purchases/new" className={buttonStyles()}>
          Nueva compra
        </Link>
      }
    />
  );

  // 1. ¿Quién es y de qué empresa? readOnlyCookies: una página no puede
  //    escribir cookies (de eso se encarga el proxy).
  const contexto = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!contexto.ok) {
    return (
      <>
        {encabezado}
        <AccessAlert code={contexto.error.code} />
      </>
    );
  }

  // 2. La versión vigente del agente y las reglas de pago (las dos lecturas a
  //    la vez). Si alguna falla, lo decimos: nunca inventamos datos (no
  //    marcamos un paso como "falta" sin saberlo).
  const [perfil, reglas] = await Promise.all([getAgentProfile(contexto.data), getPurchasePolicy(contexto.data)]);
  if (!perfil.ok) {
    return (
      <>
        {encabezado}
        <Alert tone="danger" title={perfil.error.message} />
      </>
    );
  }
  // Si fallan solo las reglas, el resto de la pantalla se ve igual: el paso
  // "Reglas de pago" queda como no hecho y el error aparece en su fila (abajo).

  // null = la empresa todavía no guardó nada (estado "vacío").
  const version = perfil.data.current?.version ?? null;
  const tienePerfil = version !== null;
  // null = la empresa todavía no cargó reglas de pago.
  const tieneReglas = reglas.ok && reglas.data.policy !== null;

  // El botón de la tarjeta lleva al PRÓXIMO paso que falta, y solo si la
  // persona lo puede hacer (perfil y reglas los cambian solo los admin; lo
  // decide la base). Si no puede, no ponemos botón: invitarla a algo que no
  // va a poder guardar confunde, y un botón gris sobre esta tarjeta gris no
  // se distinguiría (regla "nada gris sobre gris" de docs/DESIGN.md).
  let accion: ReactNode = undefined;
  if (!tienePerfil) {
    if (perfil.data.can_edit) {
      accion = (
        <Link href="/agent/profile" className={buttonStyles()}>
          Completar perfil
        </Link>
      );
    }
  } else if (!tieneReglas) {
    // reglas.ok: si no pudimos leerlas, no sabemos si puede cargarlas: sin botón.
    if (reglas.ok && reglas.data.can_edit) {
      accion = (
        <Link href="/agent/rules" className={buttonStyles()}>
          Cargar reglas
        </Link>
      );
    }
  } else if (perfil.data.can_edit) {
    // Todo listo: como antes, la invitamos a mantener el perfil al día.
    accion = (
      <Link href="/agent/profile" className={buttonStyles()}>
        Editar perfil
      </Link>
    );
  }

  return (
    <>
      {encabezado}

      {/* div: la etiqueta queda de su tamaño y no se estira a todo el ancho. */}
      <div>
        {tienePerfil ? (
          <Badge icon={CircleCheck}>Versión {version}</Badge>
        ) : (
          <Badge tone="warning" icon={TriangleAlert}>
            Sin configurar
          </Badge>
        )}
      </div>

      <ProgressCard
        title="Configuración del agente"
        steps={[
          { label: "Perfil de empresa", done: tienePerfil },
          { label: "Reglas de pago", done: tieneReglas },
        ]}
        action={accion}
      />

      {/* aria-label: el lector de pantalla anuncia "Secciones del agente, lista, 2 elementos".
          Instrucciones, criterios y conocimiento no se muestran: el brief v3 los esconde. */}
      <ul aria-label="Secciones del agente" className="flex flex-col gap-2.5">
        <li>
          <ListItem
            title="Perfil de empresa"
            actions={
              <Link href="/agent/profile" className={buttonStyles({ size: "sm" })}>
                Abrir
                {/* Texto invisible: para el lector de pantalla el link dice
                    "Abrir perfil de empresa" y no un "Abrir" suelto. */}
                <span className="sr-only"> perfil de empresa</span>
              </Link>
            }
          />
        </li>
        <li>
          <ListItem
            title="Reglas de pago"
            actions={
              <Link href="/agent/rules" className={buttonStyles({ size: "sm" })}>
                Abrir
                {/* Texto invisible: el link dice "Abrir reglas de pago". */}
                <span className="sr-only"> reglas de pago</span>
              </Link>
            }
          />
          {/* Error corto en la fila de las reglas (el resto de la pantalla sigue). */}
          {!reglas.ok && <Alert tone="danger" title={reglas.error.message} className="mt-2.5" />}
        </li>
      </ul>
    </>
  );
}
