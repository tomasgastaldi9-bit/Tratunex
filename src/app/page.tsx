import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, fechaDeHoy } from "@/components/ui/AppShell";
import { buttonStyles } from "@/components/ui/Button";
import { cx } from "@/components/ui/cx";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { getAgentProfile, getPurchasePolicy } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Inicio: qué falta configurar y el recorrido de una compra (BRIEF §4).
 *
 * Solo muestra datos que lee de verdad (si el perfil y las reglas están
 * cargados). No inventa números: si algo no se puede leer, lo dice.
 */
export const metadata: Metadata = {
  title: "Inicio · Tratunex",
};

export const dynamic = "force-dynamic";

type Estado = "listo" | "falta" | "desconocido";

export default async function HomePage() {
  const contexto = await getCompanyContext(undefined, { readOnlyCookies: true });

  let perfil: Estado = "desconocido";
  let reglas: Estado = "desconocido";
  if (contexto.ok) {
    const [p, r] = await Promise.all([getAgentProfile(contexto.data), getPurchasePolicy(contexto.data)]);
    if (p.ok) perfil = p.data.current ? "listo" : "falta";
    if (r.ok) reglas = r.data.policy ? "listo" : "falta";
  }

  return (
    <AppShell>
      <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-ink-muted">{fechaDeHoy()}</p>
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em]">Inicio</h1>
        </div>
        <Link href="/purchases/new" className={buttonStyles()}>
          Nueva compra
        </Link>
      </header>

      {!contexto.ok && <AccessAlert code={contexto.error.code} />}

      {contexto.ok && <ProximoPaso perfil={perfil} reglas={reglas} />}

      {contexto.ok && (
        <Seccion titulo="Antes de comprar" descripcion="El agente necesita saber quién compra y hasta cuánto puede pagar.">
          <Fila
            titulo="Perfil de empresa"
            detalle={<EstadoTexto estado={perfil} listo="Cargado" falta="Falta cargarlo" />}
            accion={<Ir href="/agent/profile">{perfil === "listo" ? "Ver" : "Completar"}</Ir>}
          />
          <Fila
            titulo="Reglas de pago"
            detalle={<EstadoTexto estado={reglas} listo="Cargadas" falta="Faltan cargar" />}
            accion={<Ir href="/agent/rules">{reglas === "listo" ? "Ver" : "Cargar"}</Ir>}
          />
        </Seccion>
      )}

      <Seccion titulo="Cómo compra el agente" descripcion="De la necesidad al pago, con su comprobante.">
        <Fila
          numero={1}
          titulo="Necesidad"
          detalle="Producto, cantidad, para cuándo y presupuesto."
          accion={<Ir href="/purchases/new">Nueva compra</Ir>}
        />
        <Fila
          numero={2}
          titulo="Reglas del dueño"
          detalle="Hasta cuánto paga solo y a qué proveedores."
          accion={<Ir href="/agent/rules">Reglas</Ir>}
        />
        <Fila
          numero={3}
          titulo="Proveedores"
          detalle="Con su teléfono y su billetera de cobro."
          accion={<Ir href="/suppliers">Proveedores</Ir>}
        />
        <Fila
          numero={4}
          titulo="Cotización por teléfono"
          detalle="El cotizador llama al proveedor y se guarda lo que dijo."
          accion={<Ir href="/calls/quotes/import">Cotizaciones</Ir>}
        />
        <Fila
          numero={5}
          titulo="Elección y pago"
          detalle="Ranking explicado y pago en ARGt con su hash."
          accion={<span className="text-sm text-ink-subtle">En construcción</span>}
        />
      </Seccion>
    </AppShell>
  );
}

function Seccion({ titulo, descripcion, children }: { titulo: string; descripcion: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-0.5">
        <h2 className="text-[15px] font-semibold">{titulo}</h2>
        <p className="text-sm text-ink-muted">{descripcion}</p>
      </div>
      <ul className="divide-y divide-line rounded-card border border-line bg-surface">{children}</ul>
    </section>
  );
}

function Fila({
  numero,
  titulo,
  detalle,
  accion,
}: {
  numero?: number;
  titulo: string;
  detalle: ReactNode;
  accion: ReactNode;
}) {
  return (
    <li className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3.5 sm:items-center">
      {numero !== undefined && (
        <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-gray-900 text-xs font-semibold text-white tabular-nums">
          {numero}
        </span>
      )}
      <div className="flex min-w-0 grow basis-60 flex-col gap-0.5 sm:flex-row sm:items-baseline sm:gap-4">
        <p className="text-sm font-medium sm:w-48 sm:shrink-0">{titulo}</p>
        <div className="text-sm text-ink-muted">{detalle}</div>
      </div>
      <div className="shrink-0">{accion}</div>
    </li>
  );
}

function EstadoTexto({ estado, listo, falta }: { estado: Estado; listo: string; falta: string }) {
  const texto = estado === "listo" ? listo : estado === "falta" ? falta : "No pudimos leerlo";
  const color = estado === "listo" ? "bg-success" : estado === "falta" ? "bg-warning" : "bg-ink-subtle";
  return (
    <span className="inline-flex items-center gap-2">
      <span aria-hidden className={cx("size-1.5 rounded-full", color)} />
      <span className={estado === "falta" ? "text-warning" : estado === "listo" ? "text-success" : undefined}>{texto}</span>
    </span>
  );
}

function Ir({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className={buttonStyles({ variant: "secondary", size: "sm" })}>
      {children}
    </Link>
  );
}

/**
 * Bloque oscuro con lo próximo que conviene hacer, según lo que está cargado
 * de verdad. Es lo que más resalta de la pantalla, a propósito: una sola
 * acción clara. Si no pudimos leer el estado, no se muestra.
 */
function ProximoPaso({ perfil, reglas }: { perfil: Estado; reglas: Estado }) {
  if (perfil === "desconocido" || reglas === "desconocido") return null;
  const paso =
    perfil === "falta"
      ? {
          titulo: "Completá el perfil de tu empresa",
          texto: "El agente lo usa para presentarse cuando llama a los proveedores.",
          href: "/agent/profile",
          accion: "Completar perfil",
        }
      : reglas === "falta"
        ? {
            titulo: "Cargá tus reglas de pago",
            texto: "Hasta cuánto puede pagar el agente solo y cuándo te pide aprobación.",
            href: "/agent/rules",
            accion: "Cargar reglas",
          }
        : {
            titulo: "Todo listo para comprar",
            texto: "Contale al agente qué necesitás y él pide cotización a los proveedores.",
            href: "/purchases/new",
            accion: "Nueva compra",
          };
  return (
    <section className="flex flex-col gap-4 rounded-card bg-gray-900 px-6 py-5 text-white sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-col gap-1">
        <p className="text-xs text-gray-400">Próximo paso</p>
        <h2 className="text-lg leading-snug font-semibold">{paso.titulo}</h2>
        <p className="text-sm text-gray-300">{paso.texto}</p>
      </div>
      <Link
        href={paso.href}
        className={buttonStyles({ variant: "inverse", className: "shrink-0" })}
      >
        {paso.accion}
      </Link>
    </section>
  );
}
