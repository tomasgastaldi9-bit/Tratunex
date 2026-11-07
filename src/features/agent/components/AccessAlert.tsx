import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import type { ErrorCode } from "@/contracts/common";

/**
 * Aviso para cuando no pudimos saber quién es la persona o de qué empresa
 * (cuando falla getCompanyContext). Dice qué pasó y qué hacer, con un botón
 * para resolverlo cuando se puede.
 *
 * Lo usan /agent, /agent/profile y /purchases/new: está en un solo lugar para
 * que digan lo mismo. "subject" cambia el final del título cuando la pantalla
 * necesita otro texto (por defecto, "para ver tu agente").
 *
 * No tiene "use client" ni estado: funciona en páginas del servidor.
 *
 *   const contexto = await getCompanyContext(undefined, { readOnlyCookies: true });
 *   if (!contexto.ok) return <AccessAlert code={contexto.error.code} />;
 */
export function AccessAlert({ code, subject = "para ver tu agente" }: { code: ErrorCode; subject?: string }) {
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
  // getCompanyContext no nos dice cuál de los dos pasó, así que ofrecemos las
  // dos salidas: iniciar sesión (la principal) o elegir otra empresa (por si
  // ya inició sesión pero eligió una empresa de la que no es parte).
  if (code === "FORBIDDEN") {
    return (
      <Alert
        tone="warning"
        title={"Iniciá sesión " + subject}
        action={
          // Alert recibe una sola "action": juntamos los dos botones en un div.
          // flex-wrap: en el celular, si no entran uno al lado del otro, el segundo baja.
          <div className="flex flex-wrap gap-2.5">
            <Link href="/login" className={buttonStyles({ size: "sm" })}>
              Iniciar sesión
            </Link>
            <Link href="/login/companies" className={buttonStyles({ variant: "secondary", size: "sm" })}>
              Elegir otra empresa
            </Link>
          </div>
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
