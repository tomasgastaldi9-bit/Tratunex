import { CircleCheck, Clock, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { buttonStyles } from "@/components/ui/Button";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressCard } from "@/components/ui/ProgressCard";
import type { ErrorCode } from "@/contracts/common";
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

/**
 * Aviso cuando no pudimos saber quién es la persona o de qué empresa:
 * qué pasó y qué hacer, con un botón para resolverlo cuando se puede.
 * (La misma regla está en /agent/profile.)
 */
function AvisoDeAcceso({ code }: { code: ErrorCode }) {
  // VALIDATION_ERROR: no hay una empresa elegida (o la cookie no sirve).
  if (code === "VALIDATION_ERROR") {
    return (
      <Alert
        tone="warning"
        title="Elegí una empresa para seguir"
        action={
          <Link href="/login/companies" className={buttonStyles({ size: "sm" })}>
            Elegir empresa
          </Link>
        }
      />
    );
  }
  // FORBIDDEN: no inició sesión, o no es miembro de esa empresa.
  if (code === "FORBIDDEN") {
    return (
      <Alert
        tone="warning"
        title="Iniciá sesión para ver tu agente"
        action={
          <Link href="/login" className={buttonStyles({ size: "sm" })}>
            Iniciar sesión
          </Link>
        }
      />
    );
  }
  // Cualquier otro (por ejemplo, el servicio de acceso no respondió): es un error nuestro.
  return (
    <Alert tone="danger" title="No pudimos comprobar tu acceso">
      Probá de nuevo en un rato.
    </Alert>
  );
}

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
        <AvisoDeAcceso code={contexto.error.code} />
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
          <Link href="/agent/profile" className={buttonStyles()}>
            {tienePerfil ? "Editar perfil" : "Completar perfil"}
          </Link>
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
