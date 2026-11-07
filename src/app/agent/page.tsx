import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressCard } from "@/components/ui/ProgressCard";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { getAgentProfile } from "@/features/agent/server/public";
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
    <PageHeader title="Agente" description="Lo que tu agente sabe de tu empresa y cómo habla en cada llamada." />
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

  // 2. La versión vigente del agente. Si falla, lo decimos: nunca inventamos datos.
  const perfil = await getAgentProfile(contexto.data);
  if (!perfil.ok) {
    return (
      <>
        {encabezado}
        <Alert tone="danger" title={perfil.error.message} />
      </>
    );
  }

  // null = la empresa todavía no guardó nada (estado "vacío").
  const version = perfil.data.current?.version ?? null;
  const tienePerfil = version !== null;
  // Solo los admin pueden cambiar el perfil (lo decide la base, en getAgentProfile).
  const puedeEditar = perfil.data.can_edit;

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
          // Estas tres secciones todavía no existen: por ahora nunca están hechas.
          { label: "Instrucciones del vendedor", done: false },
          { label: "Criterios de cliente potencial", done: false },
          { label: "Base de conocimiento", done: false },
        ]}
        action={
          // Si no puede editar, no la invitamos a "completar" ni a "editar"
          // algo que después no va a poder guardar. Tampoco ponemos un botón
          // gris: sobre esta tarjeta gris no se distinguiría (regla "nada gris
          // sobre gris" de docs/DESIGN.md). Para mirar el perfil ya tiene el
          // botón "Abrir" en la lista de abajo.
          puedeEditar ? (
            <Link href="/agent/profile" className={buttonStyles()}>
              {tienePerfil ? "Editar perfil" : "Completar perfil"}
            </Link>
          ) : undefined
        }
      />

      {/* aria-label: el lector de pantalla anuncia "Secciones del agente, lista, 4 elementos". */}
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
        {/* Las otras secciones llegan en los próximos tickets (AGT-02, 03 y 04). */}
        {["Instrucciones del vendedor", "Criterios de cliente potencial", "Base de conocimiento"].map((seccion) => (
          <li key={seccion}>
            <ListItem title={seccion} meta={<Badge icon={Clock}>Próximamente</Badge>} />
          </li>
        ))}
      </ul>
    </>
  );
}
