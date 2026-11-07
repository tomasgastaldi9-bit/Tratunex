import {
  ArrowRight,
  CircleCheck,
  ClipboardList,
  Contact,
  Hammer,
  PhoneCall,
  PhoneIncoming,
  Search,
  ShieldCheck,
  ShoppingCart,
  TriangleAlert,
  Truck,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { AppShell, fechaDeHoy } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { Hero, heroButtonStyles } from "@/components/ui/Hero";
import { AccessAlert } from "@/features/agent/components/AccessAlert";
import { getAgentProfile, getPurchasePolicy } from "@/features/agent/server/public";
import { getCompanyContext } from "@/features/platform/server/public";

/**
 * Inicio: el panel del día. Bienvenida, el recorrido del agente paso a paso
 * (BRIEF §4) y accesos rápidos.
 *
 * Solo muestra datos que lee de verdad (si el perfil y las reglas están
 * cargados). No inventa números: si algo no se puede leer, no se muestra.
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
      <Hero
        eyebrow="Tu agente de compras"
        title="Hola, ¿qué compramos hoy?"
        description="Contale qué necesitás y hasta cuánto puede gastar. El agente pide cotización a los proveedores por teléfono, compara, te explica cuál conviene y paga en ARGt."
        actions={
          <>
            <Link href="/purchases/new" className={heroButtonStyles("solid")}>
              <ShoppingCart size={16} aria-hidden />
              Nueva compra
            </Link>
            <Link href="/agent/rules" className={heroButtonStyles("outline")}>
              <ShieldCheck size={16} aria-hidden />
              Reglas de pago
            </Link>
          </>
        }
        aside={
          <div className="hidden flex-col items-start gap-3 sm:flex lg:items-end">
            <p className="text-xs font-semibold tracking-[0.18em] text-white/60 uppercase">Panel del día</p>
            <p className="rounded-control border border-white/15 bg-white/[0.06] px-5 py-3 text-base font-semibold">
              {fechaDeHoy()}
            </p>
          </div>
        }
      />

      {!contexto.ok && <AccessAlert code={contexto.error.code} />}

      {/* Estado de la configuración: leído de la base, no inventado. */}
      {contexto.ok && (
        <section aria-label="Configuración del agente" className="grid gap-4 sm:grid-cols-2">
          <EstadoCard
            titulo="Perfil de empresa"
            estado={perfil}
            listo="Cargado"
            falta="Falta cargarlo"
            href="/agent/profile"
            icon={ClipboardList}
          />
          <EstadoCard
            titulo="Reglas de pago"
            estado={reglas}
            listo="Cargadas"
            falta="Faltan cargar"
            href="/agent/rules"
            icon={ShieldCheck}
          />
        </section>
      )}

      <Card padding="none">
        <div className="flex flex-col gap-1 border-b border-line px-6 py-5">
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <span aria-hidden className="size-2 rounded-full bg-ink" />
            Cómo compra tu agente
          </h2>
          <p className="text-sm text-ink-muted">Cinco pasos, de la necesidad al pago con su comprobante.</p>
        </div>
        <ol className="grid gap-px bg-line sm:grid-cols-2 xl:grid-cols-5">
          <Paso n={1} icon={ShoppingCart} titulo="Contá qué necesitás" texto="Producto, cantidad, fecha y presupuesto." href="/purchases/new" />
          <Paso
            n={2}
            icon={ShieldCheck}
            titulo="Poné tus reglas"
            texto="Hasta cuánto paga solo y a quién."
            href="/agent/rules"
            extra={<EstadoBadge estado={reglas} listo="Cargadas" falta="Faltan" />}
          />
          <Paso n={3} icon={Truck} titulo="Elegí proveedores" texto="Con su teléfono y su billetera de cobro." href="/suppliers" />
          <Paso
            n={4}
            icon={PhoneIncoming}
            titulo="Cotización por teléfono"
            texto="El cotizador llama y guardás lo que dijo."
            href="/calls/quotes/import"
          />
          <Paso
            n={5}
            icon={Wallet}
            titulo="Compará y pagá"
            texto="Ranking con IA y pago en ARGt con su hash."
            extra={
              <Badge tone="warning" icon={Hammer}>
                En construcción
              </Badge>
            }
          />
        </ol>
      </Card>

      <section aria-labelledby="accesos" className="flex flex-col gap-3">
        <h2 id="accesos" className="text-lg font-semibold">
          Accesos rápidos
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Acceso href="/calls" icon={PhoneCall} titulo="Llamadas" texto="Cada llamada y su resultado." />
          <Acceso href="/prospects" icon={Search} titulo="Buscar proveedores" texto="Por rubro y zona, en la web." />
          <Acceso href="/contacts" icon={Contact} titulo="Contactos" texto="Tu agenda de empresas." />
          <Acceso href="/agent/profile" icon={ClipboardList} titulo="Perfil de empresa" texto="Qué hace tu pyme." />
        </div>
      </section>
    </AppShell>
  );
}

function EstadoBadge({ estado, listo, falta }: { estado: Estado; listo: string; falta: string }) {
  if (estado === "listo")
    return (
      <Badge tone="success" icon={CircleCheck}>
        {listo}
      </Badge>
    );
  if (estado === "falta")
    return (
      <Badge tone="warning" icon={TriangleAlert}>
        {falta}
      </Badge>
    );
  return null;
}

function EstadoCard({
  titulo,
  estado,
  listo,
  falta,
  href,
  icon: Icono,
}: {
  titulo: string;
  estado: Estado;
  listo: string;
  falta: string;
  href: string;
  icon: LucideIcon;
}) {
  const borde = estado === "listo" ? "border-l-success" : estado === "falta" ? "border-l-warning" : "border-l-ink";
  return (
    <Link
      href={href}
      className={`group flex items-center gap-4 rounded-card border border-l-4 border-line ${borde} bg-surface px-5 py-4 shadow-card transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink`}
    >
      <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-wash ring-1 ring-line">
        <Icono size={20} aria-hidden />
      </span>
      <span className="flex min-w-0 grow flex-col gap-1">
        <span className="text-xs font-semibold tracking-[0.12em] text-ink-muted uppercase">{titulo}</span>
        <span className="text-lg leading-tight font-semibold">
          {estado === "listo" ? listo : estado === "falta" ? falta : "No pudimos leerlo"}
        </span>
      </span>
      <ArrowRight size={18} aria-hidden className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}

function Paso({
  n,
  icon: Icono,
  titulo,
  texto,
  href,
  extra,
}: {
  n: number;
  icon: LucideIcon;
  titulo: string;
  texto: string;
  href?: string;
  extra?: ReactNode;
}) {
  const contenido = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="flex size-10 items-center justify-center rounded-full bg-ink text-white">
          <Icono size={18} aria-hidden />
        </span>
        <span className="text-xs font-semibold tracking-[0.12em] text-ink-subtle">PASO {n}</span>
      </div>
      <div className="flex flex-col gap-1.5">
        <p className="text-base leading-tight font-semibold">{titulo}</p>
        <p className="text-sm leading-snug text-ink-muted">{texto}</p>
      </div>
      {extra && <div>{extra}</div>}
    </>
  );

  return (
    <li className="bg-surface">
      {href ? (
        <Link
          href={href}
          className="flex h-full flex-col gap-4 p-5 transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
        >
          {contenido}
        </Link>
      ) : (
        <div className="flex h-full flex-col gap-4 p-5">{contenido}</div>
      )}
    </li>
  );
}

function Acceso({ href, icon: Icono, titulo, texto }: { href: string; icon: LucideIcon; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-4 rounded-card border border-line bg-surface p-4 shadow-card transition-colors hover:border-ink-subtle/50 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex size-10 shrink-0 items-center justify-center rounded-[12px] bg-wash ring-1 ring-line">
        <Icono size={18} aria-hidden />
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-[15px] leading-tight font-semibold">{titulo}</span>
        <span className="truncate text-xs text-ink-muted">{texto}</span>
      </span>
      <ArrowRight size={16} aria-hidden className="shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
    </Link>
  );
}
