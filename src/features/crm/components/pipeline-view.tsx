import Link from "next/link";
import type { ReactNode } from "react";
import { ArrowLeft, ArrowRight, Columns3, ShieldOff } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Badge } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { StageBadge } from "@/components/ui/StatusBadges";
import { PIPELINE_STAGES, type ContactDTO, type DealDTO, type PipelineStage } from "@/contracts/crm";
import type { ErrorCode } from "@/contracts/common";
import { PipelineCreate } from "./pipeline-create";
import { PipelineStageEditor } from "./pipeline-stage-editor";

type Company = { id: string; name: string; industry?: string | null };
type Filters = { limit?: number; cursor?: string; contact_id?: string; stage?: PipelineStage };

export function PipelineFrame({ company, children }: { company?: Company; children: ReactNode }) {
  return <AppShell>
    {company && <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line pb-4">
      <div className="min-w-0"><p className="break-words text-sm font-bold">{company.name}</p>
        {company.industry && <p className="text-xs text-ink-muted">{company.industry}</p>}</div>
      <Link href="/login/companies" className={buttonStyles({ variant: "ghost", size: "sm" })}>Cambiar empresa</Link>
    </div>}{children}
  </AppShell>;
}

export function PipelineAccessState({ code, message }: { code: ErrorCode; message?: string }) {
  const needsSession = code === "FORBIDDEN" || (code === "VALIDATION_ERROR" && /seleccion.*empresa/i.test(message ?? ""));
  const invalid = code === "VALIDATION_ERROR";
  return <PipelineFrame><PageHeader title="Pipeline" />
    <Alert tone={needsSession || invalid ? "warning" : "danger"}
      title={needsSession ? "Elegí una empresa para ver el pipeline" : invalid ? "Revisá los filtros del tablero" : "No pudimos cargar el pipeline"}>
      {needsSession ? "Iniciá sesión y seleccioná la empresa con la que querés trabajar."
        : invalid ? "Hay un filtro o cursor que no es válido. Volvé al tablero para empezar de nuevo."
          : message ?? "La conexión del CRM no está disponible. Volvé a intentar cuando se restablezca."}
    </Alert>
    <div><Link href={needsSession ? "/login/companies" : "/pipeline"} className={buttonStyles({ variant: "secondary" })}>
      {needsSession ? "Seleccionar empresa" : "Volver a cargar pipeline"}</Link></div>
  </PipelineFrame>;
}

function pipelineLink(filters: Filters, cursor?: string) {
  const params = new URLSearchParams();
  for (const key of ["limit", "contact_id", "stage"] as const) if (filters[key]) params.set(key, String(filters[key]));
  if (cursor) params.set("cursor", cursor);
  return `/pipeline${params.size ? `?${params}` : ""}`;
}

export function PipelineView({ company, page, contacts, filters }: {
  company: Company; page: { items: DealDTO[]; next_cursor: string | null }; contacts: readonly ContactDTO[]; filters: Filters;
}) {
  const names = new Map(contacts.map(contact => [contact.id, contact]));
  const filteredContact = filters.contact_id ? names.get(filters.contact_id) : null;
  const filtered = !!(filters.contact_id || filters.stage);
  return <PipelineFrame company={company}>
    <PageHeader title="Pipeline" description="Organizá las oportunidades y actualizá su etapa." actions={
      <Link href="/contacts" className={buttonStyles({ variant: "ghost" })}>Ver contactos<ArrowRight size={16} aria-hidden /></Link>} />
    <PipelineCreate key={company.id} companyId={company.id} contactId={filters.contact_id} contacts={contacts} />
    <Card className="space-y-4">
      <form action="/pipeline" method="get" className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
        {filters.contact_id && <input type="hidden" name="contact_id" value={filters.contact_id} />}
        <Select label="Filtrar oportunidades por etapa" name="stage" defaultValue={filters.stage ?? ""} className="min-w-0 sm:min-w-64"
          options={[{ value: "", label: "Todas las etapas" }, ...PIPELINE_STAGES.map(item => ({ value: item.code, label: item.label }))]} />
        <Button type="submit" variant="secondary">Aplicar filtro</Button>
        {filtered && <Link href="/pipeline" className={buttonStyles({ variant: "ghost" })}>Limpiar filtros</Link>}
      </form>
      {filters.contact_id && <p className="break-words text-sm text-ink-muted">Oportunidades de {filteredContact?.name ?? "este contacto"}.
        {filteredContact && <Link href={`/contacts/${filteredContact.id}`} className="ml-1 font-bold text-ink underline underline-offset-4">Ver ficha</Link>}</p>}
    </Card>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm font-bold">{page.items.length} {page.items.length === 1 ? "oportunidad en esta página" : "oportunidades en esta página"}</p>
      <p className="hidden text-xs text-ink-muted md:block">Recorré el tablero hacia los costados para ver todas las etapas.</p>
    </div>
    {!page.items.length && <EmptyState icon={Columns3} title={filtered ? "No hay oportunidades con esos filtros" : "Todavía no creaste oportunidades"}
      description={filtered ? "Probá otra etapa o limpiá los filtros para ver el resto." : "Creá una oportunidad para un contacto y seguí su avance en el tablero."} />}
    <section role="region" aria-label="Tablero de siete etapas del pipeline" tabIndex={0}
      className="min-w-0 overflow-x-auto rounded-card pb-4 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink">
      <div className="grid gap-4 md:min-w-[1820px] md:grid-cols-7">
        {PIPELINE_STAGES.map(stage => {
          const deals = page.items.filter(deal => deal.stage === stage.code);
          return <section key={stage.code} aria-label={`Etapa ${stage.label}`} className="min-w-0 rounded-card border border-line p-3">
            <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
              <h2><StageBadge stage={stage.code} /></h2><span className="text-xs text-ink-muted">{deals.length} en esta página</span>
            </header>
            {deals.length ? <ul className="space-y-3">{deals.map(deal => {
              const contact = names.get(deal.contact_id);
              return <li key={deal.id}><Card className="min-w-0" padding="md">
                <h3 className="break-words text-base font-bold">{deal.title}</h3>
                <Link href={`/contacts/${deal.contact_id}`} className="mt-2 block break-words text-sm text-ink-muted underline underline-offset-4">
                  {contact?.name ?? "Ver contacto"}</Link>
                {contact?.do_not_contact && <Badge tone="danger" icon={ShieldOff} className="mt-3">No contactar</Badge>}
                <PipelineStageEditor key={`${deal.id}:${deal.updated_at}`} deal={deal} />
              </Card></li>;
            })}</ul> : <p className="py-5 text-center text-xs text-ink-muted">Sin oportunidades en esta página</p>}
          </section>;
        })}
      </div>
    </section>
    {(filters.cursor || page.next_cursor) && <nav aria-label="Paginación del pipeline" className="flex flex-wrap items-center justify-between gap-3">
      {filters.cursor ? <Link href={pipelineLink(filters)} className={buttonStyles({ variant: "ghost" })}><ArrowLeft size={16} aria-hidden />Primera página</Link> : <span />}
      {page.next_cursor && <Link href={pipelineLink(filters, page.next_cursor)} className={buttonStyles({ variant: "secondary" })}>Siguiente página<ArrowRight size={16} aria-hidden /></Link>}
    </nav>}
  </PipelineFrame>;
}
