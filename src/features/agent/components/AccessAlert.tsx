import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import type { ErrorCode } from "@/contracts/common";

/**
 * Aviso para cuando no pudimos saber quién es la persona o de qué empresa
 * (cuando falla getCompanyContext). Dice qué pasó y qué hacer, con un botón
 * para resolverlo cuando se puede.
 *
 * Lo usan /agent y /agent/profile: está en un solo lugar para que las dos
 * pantallas digan exactamente lo mismo.
 *
 * No tiene "use client" ni estado: funciona en páginas del servidor.
 *
 *   const contexto = await getCompanyContext(undefined, { readOnlyCookies: true });
 *   if (!contexto.ok) return <AccessAlert code={contexto.error.code} />;
 */
export function AccessAlert({ code }: { code: ErrorCode }) {
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
