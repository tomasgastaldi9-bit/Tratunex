import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search, ShieldOff, Truck, Wallet } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import type { ErrorCode } from "@/contracts/common";
import type { SupplierDTO } from "@/contracts/crm";
import { SupplierEditor } from "./supplier-editor";
import { SupplierWalletEditor } from "./supplier-wallet-editor";

type Company = { id: string; name: string; industry?: string | null };
type Filters = { limit?: number; cursor?: string; query?: string; source?: "manual" | "csv" | "firecrawl";
  do_not_contact?: "true" | "false"; wallet_status?: "pending" | "configured" };
const sourceLabels = { manual: "Carga manual", csv: "Archivo CSV", firecrawl: "Búsqueda web" };
const chainLabels = { base: "Base", arbitrum: "Arbitrum" };

export function SuppliersFrame({ company, children }: { company?: Company; children: ReactNode }) {
  return <AppShell>
    {company && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0"><p className="break-words text-sm font-bold">{company.name}</p>
        {company.industry && <p className="text-xs text-ink-muted">{company.industry}</p>}</div>
      <Link href="/login/companies" className={buttonStyles({ variant: "ghost", size: "sm" })}>Cambiar empresa</Link>
    </div>}{children}
  </AppShell>;
}

export function SupplierAccessState({ code, message }: { code: ErrorCode; message?: string }) {
  const needsSession = code === "FORBIDDEN" || (code === "VALIDATION_ERROR" && /seleccion.*empresa/i.test(message ?? ""));
  const invalid = code === "VALIDATION_ERROR";
  return <SuppliersFrame><PageHeader title="Proveedores" />
    <Alert tone={needsSession || invalid ? "warning" : "danger"}
      title={needsSession ? "Elegí una empresa para ver sus proveedores" : invalid ? "Revisá los filtros de proveedores" : "No pudimos cargar los proveedores"}>
      {needsSession ? "Iniciá sesión y seleccioná la empresa con la que querés trabajar."
        : invalid ? "Hay un filtro o cursor que no es válido. Volvé a la lista para empezar de nuevo."
          : message ?? "La conexión con los proveedores no está disponible. Volvé a intentar cuando se restablezca."}
    </Alert>
    <div><Link href={needsSession ? "/login/companies" : "/suppliers"} className={buttonStyles({ variant: "secondary" })}>
      {needsSession ? "Seleccionar empresa" : "Volver a cargar proveedores"}</Link></div>
  </SuppliersFrame>;
}

function listLink(filters: Filters, cursor?: string) {
  const params = new URLSearchParams();
  for (const key of ["limit", "query", "source", "do_not_contact", "wallet_status"] as const) {
    if (filters[key]) params.set(key, String(filters[key]));
  }
  if (cursor) params.set("cursor", cursor);
  return `/suppliers${params.size ? `?${params}` : ""}`;
}

function WalletStatus({ supplier }: { supplier: SupplierDTO }) {
  return supplier.collection_wallet ? <Badge icon={Wallet}>Billetera registrada · {chainLabels[supplier.collection_wallet.chain]}</Badge>
    : <Badge tone="warning" icon={Wallet}>Billetera pendiente</Badge>;
}

export function SuppliersListView({ company, page, filters }: {
  company: Company; page: { items: readonly SupplierDTO[]; next_cursor: string | null }; filters: Filters;
}) {
  const filtered = !!(filters.query || filters.source || filters.do_not_contact || filters.wallet_status);
  return <SuppliersFrame company={company}>
    <PageHeader title="Proveedores" description="Contactos, fuentes y datos de cobro de los proveedores de tu empresa." />
    <SupplierEditor key={company.id} companyId={company.id} />
    <Card className="space-y-5">
      <h2 className="text-base font-bold">Buscar y filtrar proveedores</h2>
      <form action="/suppliers" method="get" className="grid items-end gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Input label="Buscar proveedores" name="query" type="search" icon={Search} maxLength={100}
          defaultValue={filters.query ?? ""} placeholder="Nombre, empresa o teléfono" />
        <Select label="Origen" name="source" defaultValue={filters.source ?? ""} options={[
          { value: "", label: "Todos los orígenes" }, ...Object.entries(sourceLabels).map(([value, label]) => ({ value, label })),
        ]} />
        <Select label="Preferencia de contacto" name="do_not_contact" defaultValue={filters.do_not_contact ?? ""} options={[
          { value: "", label: "Todos los proveedores" }, { value: "false", label: "Contacto permitido" }, { value: "true", label: "No contactar" },
        ]} />
        <Select label="Billetera de cobro" name="wallet_status" defaultValue={filters.wallet_status ?? ""} options={[
          { value: "", label: "Todos los estados" }, { value: "pending", label: "Billetera pendiente" }, { value: "configured", label: "Billetera registrada" },
        ]} />
        <div className="flex flex-wrap gap-2.5"><Button type="submit" variant="secondary">Aplicar filtros</Button>
          {filtered && <Link href="/suppliers" className={buttonStyles({ variant: "ghost" })}>Limpiar filtros</Link>}</div>
      </form>
    </Card>
    <section aria-label="Lista de proveedores" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-bold">{filtered ? "Resultados de la búsqueda" : "Proveedores de la empresa"}</h2>
        <p className="text-xs text-ink-muted">{page.items.length} {page.items.length === 1 ? "proveedor en esta página" : "proveedores en esta página"}</p></div>
      {page.items.length ? <ul className="space-y-2.5">{page.items.map(supplier => <li key={supplier.id}>
        <ListItem leading={<Avatar name={supplier.name} />} title={supplier.name}
          subtitle={[supplier.organization, supplier.phone_e164].filter(Boolean).join(" · ")}
          meta={<div className="flex min-w-0 flex-col gap-2">
            <div className="flex flex-wrap gap-2"><Badge>{sourceLabels[supplier.source.kind]}</Badge><WalletStatus supplier={supplier} />
              {supplier.do_not_contact && <Badge tone="danger" icon={ShieldOff}>No contactar</Badge>}</div>
            {supplier.collection_wallet && <p className="max-w-xs break-all font-mono text-xs text-ink-muted">{supplier.collection_wallet.address}</p>}
          </div>}
          actions={<Link href={`/suppliers/${supplier.id}`} aria-label={`Ver proveedor ${supplier.name}`}
            className={buttonStyles({ variant: "ghost", size: "sm" })}>Ver proveedor<ArrowRight size={14} aria-hidden /></Link>} />
      </li>)}</ul> : <EmptyState icon={Truck} title={filtered ? "No encontramos proveedores con esos filtros" : "Todavía no agregaste proveedores"}
        description={filtered ? "Probá otra búsqueda, fuente o estado de billetera." : "Agregá un proveedor con sus datos de contacto y la fuente de origen."}
        action={filtered ? <Link href="/suppliers" className={buttonStyles({ variant: "secondary" })}>Limpiar filtros</Link> : undefined} />}
      {(filters.cursor || page.next_cursor) && <nav aria-label="Paginación de proveedores" className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {filters.cursor ? <Link href={listLink(filters)} className={buttonStyles({ variant: "ghost" })}><ArrowLeft size={16} aria-hidden />Primera página</Link> : <span />}
        {page.next_cursor && <Link href={listLink(filters, page.next_cursor)} className={buttonStyles({ variant: "secondary" })}>Siguiente página<ArrowRight size={16} aria-hidden /></Link>}
      </nav>}
    </section>
  </SuppliersFrame>;
}

function SupplierDatum({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><dt className="text-xs text-ink-muted">{label}</dt><dd className="break-words text-sm font-bold">{children}</dd></div>;
}

export function SupplierDetailView({ company, supplier }: { company: Company; supplier: SupplierDTO }) {
  const date = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" });
  return <SuppliersFrame company={company}>
    <div><Link href="/suppliers" className={buttonStyles({ variant: "ghost", size: "sm" })}><ArrowLeft size={16} aria-hidden />Volver a proveedores</Link></div>
    <PageHeader title={supplier.name} description={supplier.organization ?? "Ficha de proveedor"}
      className="[&>div]:min-w-0 [&_h1]:break-words [&_p]:break-words" />
    {supplier.do_not_contact && <Alert tone="warning" title="Este proveedor pidió no recibir llamadas">La preferencia se conserva al editar o reimportar sus datos.</Alert>}
    <Card className="space-y-5"><h2 className="text-base font-bold">Datos del proveedor</h2>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <SupplierDatum label="Teléfono">{supplier.phone_e164}</SupplierDatum>
        <SupplierDatum label="Empresa u organización">{supplier.organization ?? "Sin organización"}</SupplierDatum>
        <SupplierDatum label="Sitio web">{supplier.website ? <a href={supplier.website} target="_blank" rel="noreferrer" className="underline underline-offset-4">{supplier.website}</a> : "Sin sitio web"}</SupplierDatum>
        <SupplierDatum label="Origen">{sourceLabels[supplier.source.kind]} · {supplier.source.label}</SupplierDatum>
        <SupplierDatum label="Preferencia de contacto"><Badge tone={supplier.do_not_contact ? "danger" : "neutral"}>{supplier.do_not_contact ? "No contactar" : "Contacto permitido"}</Badge></SupplierDatum>
        <SupplierDatum label="Última actualización · Argentina">{date.format(new Date(supplier.updated_at))}</SupplierDatum>
      </dl>
      {supplier.source.url && <a href={supplier.source.url} target="_blank" rel="noreferrer" className="inline-block text-sm font-bold underline underline-offset-4">Consultar fuente del proveedor</a>}
    </Card>
    <SupplierEditor key={`${company.id}:${supplier.id}`} companyId={company.id} supplier={supplier} />
    <section aria-label="Billetera de cobro del proveedor" className="space-y-4">
      <Card className="space-y-5"><div className="flex flex-wrap items-center justify-between gap-3"><h2 className="text-base font-bold">Billetera de cobro</h2><WalletStatus supplier={supplier} /></div>
        {supplier.collection_wallet ? <dl className="grid gap-5 sm:grid-cols-2">
          <SupplierDatum label="Red">{chainLabels[supplier.collection_wallet.chain]}</SupplierDatum>
          <SupplierDatum label="Dirección registrada"><span className="break-all font-mono">{supplier.collection_wallet.address}</span></SupplierDatum>
          {supplier.wallet_updated_at && <SupplierDatum label="Billetera actualizada · Argentina">{date.format(new Date(supplier.wallet_updated_at))}</SupplierDatum>}
        </dl> : <p className="text-sm text-ink-muted">Podés completar la billetera cuando el proveedor te comparta sus datos de cobro.</p>}
      </Card>
      <SupplierWalletEditor key={`${supplier.id}:${supplier.wallet_version}`} supplier={supplier} />
    </section>
  </SuppliersFrame>;
}
