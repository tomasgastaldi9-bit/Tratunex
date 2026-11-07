import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Search, ShieldOff, Users } from "lucide-react";
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
import type { ContactDTO } from "@/contracts/crm";
import type { ErrorCode } from "@/contracts/common";
import { ContactEditor } from "./contact-editor";

type Company = { id: string; name: string; industry?: string | null };
type Filters = { limit?: number; cursor?: string; query?: string; source?: "csv" | "firecrawl" | "manual"; do_not_contact?: "true" | "false" };
const sourceLabels = { manual: "Carga manual", csv: "Archivo CSV", firecrawl: "Prospección web" };

export function ContactsFrame({ company, children }: { company?: Company; children: ReactNode }) {
  return <AppShell>
    {company && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0"><p className="break-words text-sm font-bold">{company.name}</p>
        {company.industry && <p className="text-xs text-ink-muted">{company.industry}</p>}</div>
      <Link href="/login/companies" className={buttonStyles({ variant: "ghost", size: "sm" })}>Cambiar empresa</Link>
    </div>}
    {children}
  </AppShell>;
}

export function ContactsAccessState({ code, message }: { code: ErrorCode; message?: string }) {
  const needsSession = code === "FORBIDDEN" || (code === "VALIDATION_ERROR" && /seleccion.*empresa/i.test(message ?? ""));
  const invalid = code === "VALIDATION_ERROR";
  return <ContactsFrame><PageHeader title="Contactos" />
    <Alert tone={needsSession || invalid ? "warning" : "danger"}
      title={needsSession ? "Elegí una empresa para ver tus contactos" : invalid ? "Revisá los filtros de la lista" : "No pudimos cargar los contactos"}>
      {needsSession ? "Iniciá sesión y seleccioná la empresa con la que querés trabajar."
        : invalid ? "Hay un filtro o cursor que no es válido. Volvé a la lista para empezar de nuevo."
          : message ?? "La conexión del CRM no está disponible. Revisá la configuración de la empresa antes de volver a intentar."}
    </Alert>
    <div><Link href={needsSession ? "/login/companies" : "/contacts"} className={buttonStyles({ variant: "secondary" })}>
      {needsSession ? "Seleccionar empresa" : "Volver a cargar contactos"}</Link></div>
  </ContactsFrame>;
}

function listLink(filters: Filters, cursor?: string) {
  const query = new URLSearchParams();
  for (const key of ["query", "source", "do_not_contact", "limit"] as const) {
    if (filters[key] !== undefined && filters[key] !== "") query.set(key, String(filters[key]));
  }
  if (cursor) query.set("cursor", cursor);
  return `/contacts${query.size ? `?${query.toString()}` : ""}`;
}

export function ContactsListView({ company, page, filters }: {
  company: Company; page: { items: ContactDTO[]; next_cursor: string | null }; filters: Filters;
}) {
  const filtered = !!(filters.query || filters.source || filters.do_not_contact);
  return <ContactsFrame company={company}>
    <PageHeader title="Contactos" description="Los datos y las preferencias de contacto de tu empresa." />
    <ContactEditor companyId={company.id} />
    <Card className="space-y-5">
      <h2 className="text-base font-bold">Buscar y filtrar</h2>
      <form action="/contacts" method="get" className="grid items-end gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.65fr)_minmax(0,0.65fr)_auto]">
        <Input label="Buscar contactos" name="query" type="search" icon={Search} defaultValue={filters.query ?? ""}
          placeholder="Nombre, empresa o teléfono" maxLength={100} />
        <Select label="Origen" name="source" defaultValue={filters.source ?? ""} options={[
          { value: "", label: "Todos los orígenes" },
          ...Object.entries(sourceLabels).map(([value, label]) => ({ value, label })),
        ]} />
        <Select label="Preferencia de contacto" name="do_not_contact" defaultValue={filters.do_not_contact ?? ""} options={[
          { value: "", label: "Todos los contactos" }, { value: "false", label: "Contacto permitido" }, { value: "true", label: "No contactar" },
        ]} />
        <Button type="submit" variant="secondary">Aplicar filtros</Button>
      </form>
      {filtered && <Link href="/contacts" className="inline-block text-sm font-bold underline underline-offset-4">Limpiar filtros</Link>}
    </Card>
    <section aria-label="Lista de contactos" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-base font-bold">{filtered ? "Resultados de la búsqueda" : "Contactos de la empresa"}</h2>
        <p className="text-xs text-ink-muted">{page.items.length} {page.items.length === 1 ? "contacto en esta página" : "contactos en esta página"}</p>
      </div>
      {page.items.length ? <ul className="space-y-2.5">{page.items.map(contact => <li key={contact.id}>
        <ListItem leading={<Avatar name={contact.name} />} title={contact.name}
          subtitle={[contact.organization, contact.phone_e164].filter(Boolean).join(" · ")}
          meta={<div className="flex flex-wrap gap-2"><Badge>{sourceLabels[contact.source.kind]}</Badge>
            {contact.do_not_contact && <Badge tone="danger" icon={ShieldOff}>No contactar</Badge>}</div>}
          actions={<Link href={`/contacts/${contact.id}`} className={buttonStyles({ variant: "ghost", size: "sm" })}
            aria-label={`Ver contacto ${contact.name}`}>Ver contacto<ArrowRight size={14} aria-hidden /></Link>} />
      </li>)}</ul> : <EmptyState icon={Users} title={filtered ? "No encontramos contactos con esos filtros" : "Todavía no cargaste contactos"}
        description={filtered ? "Probá otro nombre, origen o preferencia de contacto." : "Agregá tu primer contacto con sus datos y preferencia de contacto."}
        action={filtered ? <Link href="/contacts" className={buttonStyles({ variant: "secondary" })}>Limpiar filtros</Link> : undefined} />}
      {(filters.cursor || page.next_cursor) && <nav aria-label="Paginación de contactos" className="flex flex-wrap items-center justify-between gap-3 pt-2">
        {filters.cursor ? <Link href={listLink(filters)} className={buttonStyles({ variant: "ghost" })}><ArrowLeft size={16} aria-hidden />Primera página</Link> : <span />}
        {page.next_cursor && <Link href={listLink(filters, page.next_cursor)} className={buttonStyles({ variant: "secondary" })}>Siguiente página<ArrowRight size={16} aria-hidden /></Link>}
      </nav>}
    </section>
  </ContactsFrame>;
}

function ContactDatum({ label, children }: { label: string; children: ReactNode }) {
  return <div className="min-w-0 space-y-1.5"><dt className="text-xs text-ink-muted">{label}</dt><dd className="break-words text-sm font-bold">{children}</dd></div>;
}

export function ContactDetailView({ company, contact }: { company: Company; contact: ContactDTO }) {
  const date = new Intl.DateTimeFormat("es-AR", { timeZone: "America/Argentina/Buenos_Aires", dateStyle: "medium", timeStyle: "short" });
  return <ContactsFrame company={company}>
    <div><Link href="/contacts" className={buttonStyles({ variant: "ghost", size: "sm" })}><ArrowLeft size={16} aria-hidden />Volver a contactos</Link></div>
    <PageHeader title={contact.name} description={contact.organization ?? "Ficha de contacto"} className="[&>div]:min-w-0 [&_h1]:break-words [&_p]:break-words" />
    {contact.do_not_contact && <Alert tone="warning" title="Este contacto pidió no recibir llamadas">
      La preferencia se conserva al editar sus datos o reimportarlo.</Alert>}
    <Card className="space-y-5">
      <h2 className="text-base font-bold">Información del contacto</h2>
      <dl className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
        <ContactDatum label="Teléfono">{contact.phone_e164}</ContactDatum>
        <ContactDatum label="Empresa u organización">{contact.organization ?? "Sin organización"}</ContactDatum>
        <ContactDatum label="Sitio web">{contact.website ? <a href={contact.website} target="_blank" rel="noreferrer" className="underline underline-offset-4">{contact.website}</a> : "Sin sitio web"}</ContactDatum>
        <ContactDatum label="Origen">{sourceLabels[contact.source.kind]} · {contact.source.label}</ContactDatum>
        <ContactDatum label="Preferencia de contacto"><Badge tone={contact.do_not_contact ? "danger" : "neutral"}>{contact.do_not_contact ? "No contactar" : "Contacto permitido"}</Badge></ContactDatum>
        <ContactDatum label="Última actualización · Argentina">{date.format(new Date(contact.updated_at))}</ContactDatum>
      </dl>
      {contact.source.url && <a href={contact.source.url} target="_blank" rel="noreferrer" className="inline-block text-sm font-bold underline underline-offset-4">Consultar fuente del contacto</a>}
    </Card>
    <ContactEditor companyId={company.id} contact={contact} />
  </ContactsFrame>;
}
