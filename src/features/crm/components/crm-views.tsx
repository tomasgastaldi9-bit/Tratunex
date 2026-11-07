"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowLeft, Ban, Check, Clock, LayoutGrid, List, LoaderCircle, Phone, Search, Users, X } from "lucide-react";
import { PIPELINE_STAGES, type DealDTO, type TaskDTO } from "@/contracts/crm";
import { Alert } from "@/components/ui/Alert";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button, buttonStyles } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { PageHeader } from "@/components/ui/PageHeader";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import { CallStatusBadge, ModeBadge, PotentialBadge, StageBadge, type CallStatus } from "@/components/ui/StatusBadges";
import type { CrmDemoData } from "../server/demo";

const taskLabels = { callback: "Volver a llamar", human_review: "Revisión humana" };
const statusLabels = { pending: "Pendiente", running: "En curso", completed: "Completada", failed: "Fallida", cancelled: "Cancelada" };
const taskTones: Record<TaskDTO["status"], BadgeTone> = { pending: "neutral", running: "warning", completed: "success", failed: "danger", cancelled: "neutral" };
const taskIcons = { pending: Clock, running: LoaderCircle, completed: Check, failed: X, cancelled: Ban };
const sourceLabels = { manual: "Manual", csv: "CSV", firecrawl: "Búsqueda web" };
const actorLabels = { human: "Humano", voicemail: "Buzón", unknown: "Desconocido" };
const outcomeLabels = { interested: "Con interés", not_interested: "Sin interés", callback_requested: "Pidió seguimiento", wants_to_buy: "Quiere comprar", not_assessed: "Sin evaluar" };
const errorLabels: Record<string, string> = { PROVIDER_UNAVAILABLE: "Proveedor no disponible", PROVIDER_ERROR: "La llamada no pudo iniciarse", RATE_LIMITED: "Se alcanzó el límite de llamadas", CONFLICT: "Esta tarea cambió. Revisá su estado" };

function date(value: string | null, withTime = true) {
  if (!value) return "Fecha por definir";
  return new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires", day: "2-digit", month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit", hour12: false } : {}),
  }).format(new Date(value));
}

function contactUrl(data: CrmDemoData, id: string) {
  return `/contacts/${encodeURIComponent(id)}?demo=${data.demo}`;
}

function isOpen(task: TaskDTO) {
  return task.status === "pending" || task.status === "running";
}

function nextTask(data: CrmDemoData, contactId: string, dealId?: string) {
  return data.tasks.filter((task) => task.contact_id === contactId && isOpen(task))
    .filter((task) => dealId === undefined || task.deal_id === dealId)
    .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"))[0];
}

function TaskBadge({ task }: { task: TaskDTO }) {
  return <Badge tone={taskTones[task.status]} icon={taskIcons[task.status]}>{statusLabels[task.status]}</Badge>;
}

function Metric({ label, value, hint }: { label: string; value: number; hint: string }) {
  return <div className="crm-metric" title={hint}><StatCard value={value} label={label} className="h-full" /></div>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div role="status"><EmptyState title={title} description={description} /></div>;
}

function DealCard({ deal, data }: { deal: DealDTO; data: CrmDemoData }) {
  const person = data.contacts.find((item) => item.id === deal.contact_id);
  if (!person) return null;
  const task = nextTask(data, person.id, deal.id);
  return <Link className="crm-deal-card" href={contactUrl(data, person.id)} aria-label={`Ver ${person.name}, ${deal.title}`}>
    <Card className="crm-deal-content">
      <div className="crm-card-head"><Avatar name={person.organization || person.name} size="sm" /><span className="crm-card-organization">{person.organization || person.name}</span></div>
      <div className="crm-card-title">{deal.title}</div><div className="crm-card-person">{person.name}</div>
      <div className="crm-card-meta"><span>{sourceLabels[person.source.kind]}</span><time dateTime={deal.updated_at}>{date(deal.updated_at, false)}</time></div>
      {person.do_not_contact ? <Badge tone="danger" icon={Ban}>No contactar</Badge> : task ? <div className="crm-card-next"><span className="crm-card-next-label"><Clock size={14} aria-hidden />{task.status === "running" ? "En curso" : taskLabels[task.kind]}</span><time dateTime={task.due_at || undefined}>{date(task.due_at)}</time></div> : null}
    </Card>
  </Link>;
}

export function PipelineView({ data, initialView = "board" }: { data: CrmDemoData; initialView?: "board" | "list" }) {
  const [search, setSearch] = useState("");
  const [view, setView] = useState<"board" | "list">(initialView);
  const [stage, setStage] = useState("all");
  const needle = search.trim().toLocaleLowerCase("es-AR");
  const deals = data.deals.filter((deal) => {
    const person = data.contacts.find((item) => item.id === deal.contact_id);
    return person && (stage === "all" || deal.stage === stage) && `${person.name} ${person.organization || ""} ${deal.title}`.toLocaleLowerCase("es-AR").includes(needle);
  });
  return <div className="crm-view">
    <PageHeader title="Pipeline" description="Seguí cada oportunidad y decidí la próxima acción." actions={<Link href={`/contacts?demo=${data.demo}`} className={buttonStyles({ variant: "secondary" })}><Users size={16} aria-hidden />Ver contactos</Link>} />
    <div className="crm-metrics">
      <Metric label="Oportunidades" value={data.deals.length} hint="En esta empresa" />
      <Metric label="Clientes potenciales" value={data.deals.filter((deal) => deal.stage === "potential_client").length} hint="Con interés detectado" />
      <Metric label="Próximas acciones" value={data.tasks.filter(isOpen).length} hint="Pendientes o en curso" />
      <Metric label="Compraron" value={data.deals.filter((deal) => deal.stage === "won").length} hint="Cierres confirmados" />
    </div>
    <div className="crm-section-toolbar">
      <div className="crm-view-switch" role="group" aria-label="Vista del pipeline"><Button variant={view === "board" ? "primary" : "ghost"} icon={LayoutGrid} aria-pressed={view === "board"} onClick={() => setView("board")}>Tablero</Button><Button variant={view === "list" ? "primary" : "ghost"} icon={List} aria-pressed={view === "list"} onClick={() => setView("list")}>Lista</Button></div>
      <Select className="crm-stage-filter" label="Filtrar por etapa" hideLabel value={stage} onChange={(event) => setStage(event.target.value)} options={[{ value: "all", label: "Todas las etapas" }, ...PIPELINE_STAGES.map((item) => ({ value: item.code, label: item.label }))]} />
      <Input className="crm-search-wrap" label="Buscar oportunidad" hideLabel icon={Search} type="search" placeholder="Contacto o empresa…" value={search} onChange={(event) => setSearch(event.target.value)} />
    </div>
    {!deals.length ? <Empty title={data.deals.length ? "Sin coincidencias" : "Tu pipeline está listo para empezar"} description={data.deals.length ? "Probá otro nombre o cambiá el filtro de etapa." : "Los prospectos importados y sus oportunidades aparecerán acá."} /> : view === "board" ?
      <div className="crm-board-scroll" tabIndex={0} role="region" aria-label="Pipeline de siete etapas, desplazable horizontalmente"><div className="crm-pipeline-board">
        {PIPELINE_STAGES.map((item) => <section className="crm-pipeline-column" data-stage={item.code} key={item.code} aria-label={item.label}>
          <h2 className="crm-column-heading"><StageBadge stage={item.code} /><span className="crm-column-count">{deals.filter((deal) => deal.stage === item.code).length}</span></h2>
          {deals.some((deal) => deal.stage === item.code) ? deals.filter((deal) => deal.stage === item.code).map((deal) => <DealCard key={deal.id} deal={deal} data={data} />) : <div className="crm-column-empty">Sin oportunidades</div>}
        </section>)}
      </div></div> : <Card padding="none" className="crm-table-panel"><table className="crm-deal-table"><caption className="sr-only">Oportunidades del pipeline</caption><thead><tr><th scope="col">Oportunidad</th><th scope="col">Contacto</th><th scope="col">Etapa</th><th scope="col">Próxima acción</th></tr></thead><tbody>
        {deals.map((deal) => {
          const person = data.contacts.find((item) => item.id === deal.contact_id)!;
          const task = nextTask(data, person.id, deal.id);
          return <tr key={deal.id}><td><Link href={contactUrl(data, person.id)}>{deal.title}</Link><span className="crm-cell-secondary">{person.organization}</span></td><td data-label="Contacto">{person.name}</td><td data-label="Etapa"><StageBadge stage={deal.stage} /></td><td data-label="Próxima acción">{person.do_not_contact ? <Badge tone="danger" icon={Ban}>No contactar</Badge> : task ? `${task.status === "running" ? "En curso" : taskLabels[task.kind]} · ${date(task.due_at)}` : "Sin acción pendiente"}</td></tr>;
        })}
      </tbody></table></Card>}
    <p className="crm-quiet-note">{deals.length} de {data.deals.length} oportunidades · Ejemplo al {date(data.now)}.</p>
  </div>;
}

export function ContactsView({ data }: { data: CrmDemoData }) {
  const [search, setSearch] = useState("");
  const needle = search.trim().toLocaleLowerCase("es-AR");
  const contacts = data.contacts.filter((person) => `${person.name} ${person.organization || ""} ${person.phone_e164}`.toLocaleLowerCase("es-AR").includes(needle));
  const followedContactIds = new Set(data.deals.filter((deal) => deal.stage === "follow_up").map((deal) => deal.contact_id));
  return <div className="crm-view">
    <PageHeader title="Contactos" description="Conocé el estado de cada relación comercial." />
    <div className="crm-metrics crm-metrics-three"><Metric label="Contactos" value={data.contacts.length} hint="En esta empresa" /><Metric label="En seguimiento" value={data.contacts.filter((person) => followedContactIds.has(person.id)).length} hint="Con una oportunidad en seguimiento" /><Metric label="No contactar" value={data.contacts.filter((person) => person.do_not_contact).length} hint="Pedidos de no recibir llamadas" /></div>
    <div className="crm-section-toolbar"><h2>Todos los contactos</h2><Input className="crm-search-wrap" label="Buscar contactos" hideLabel icon={Search} type="search" placeholder="Nombre, empresa o teléfono…" value={search} onChange={(event) => setSearch(event.target.value)} /></div>
    {!contacts.length ? <Empty title={data.contacts.length ? "Sin coincidencias" : "Todavía no hay contactos"} description={data.contacts.length ? "Probá buscar por otro nombre, empresa o teléfono." : "Los contactos importados aparecerán acá."} /> : <Card padding="none" className="crm-table-panel"><table className="crm-contacts-table crm-deal-table"><caption className="sr-only">Contactos de la empresa seleccionada</caption><thead><tr><th scope="col">Contacto</th><th scope="col">Empresa</th><th scope="col">Teléfono de ejemplo</th><th scope="col">Etapas</th><th scope="col">Restricción de contacto</th></tr></thead><tbody>
      {contacts.map((person) => {
        const deals = data.deals.filter((deal) => deal.contact_id === person.id);
        return <tr key={person.id}><td><Link className="crm-contact-link" href={contactUrl(data, person.id)}><Avatar name={person.name} size="sm" /><span>{person.name}</span></Link><span className="crm-cell-secondary">{sourceLabels[person.source.kind]}</span></td><td data-label="Empresa">{person.organization || "Sin empresa"}</td><td data-label="Teléfono de ejemplo">{person.phone_e164}</td><td data-label="Etapas">{deals.length ? <div className="crm-contact-stages">{deals.map((deal) => <div key={deal.id}><StageBadge stage={deal.stage} /><span className="crm-cell-secondary">{deal.title}</span></div>)}</div> : "Sin oportunidad"}</td><td data-label="Restricción de contacto">{person.do_not_contact ? <Badge tone="danger" icon={Ban}>No contactar</Badge> : <span className="crm-quiet-note">Sin restricción registrada</span>}</td></tr>;
      })}
    </tbody></table></Card>}
    <p className="crm-quiet-note">{contacts.length} de {data.contacts.length} contactos · Un contacto puede tener varias oportunidades.</p>
  </div>;
}

export function ContactView({ data, contactId }: { data: CrmDemoData; contactId: string }) {
  const router = useRouter();
  const person = data.contacts.find((item) => item.id === contactId);
  if (!person) return <Empty title="Contacto no disponible" description="Elegí un contacto de la empresa de demostración seleccionada." />;
  const deals = data.deals.filter((deal) => deal.contact_id === person.id);
  const results = data.call_results.filter((item) => item.contact_id === person.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const calls = data.call_previews.filter((item) => item.contact_id === person.id).sort((a, b) => b.started_at.localeCompare(a.started_at));
  const latest = results[0];
  const activities = data.activities.filter((item) => item.contact_id === person.id).sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  const task = nextTask(data, person.id);
  return <div className="crm-view">
    <div className="crm-contact-context"><Link className={buttonStyles({ variant: "ghost", className: "crm-back-link" })} href={`/pipeline?demo=${data.demo}`}><ArrowLeft size={16} aria-hidden />Volver al pipeline</Link><Select className="crm-contact-chooser" label="Contacto" hideLabel value={contactId} onChange={(event) => router.push(contactUrl(data, event.target.value))} options={data.contacts.map((item) => ({ value: item.id, label: `${item.name} · ${item.organization || "Sin empresa"}` }))} /></div>
    <div className="crm-contact-heading"><Avatar name={person.name} tone="dark" /><PageHeader title={person.name} description={person.organization || undefined} className="grow" actions={<div className="crm-button-area"><Button icon={Phone} disabled aria-describedby="voice-integration-note">Llamar al contacto</Button><p id="voice-integration-note" className="crm-button-note">Telefonía pendiente de integración</p></div>} /></div>
    {person.do_not_contact && <Alert tone="danger" title="No contactar." className="crm-dnc-alert">Esta persona pidió no recibir más llamadas.</Alert>}
    {calls[0]?.status === "unknown" && <Alert tone="warning" title="Último intento con estado desconocido." className="crm-unknown-alert">Hay que confirmar su estado antes de iniciar otra llamada.</Alert>}
    <div className="crm-contact-grid"><div className="crm-contact-main">
      <Card className="crm-content-card"><h2 className="crm-panel-heading">Último resultado {latest && <time className="crm-panel-kicker" dateTime={latest.occurred_at}>{date(latest.occurred_at)}</time>}</h2>
        {latest ? <><p className="crm-summary">{latest.summary}</p><dl className="crm-classification"><div><dt>Atendió</dt><dd>{actorLabels[latest.answered_by]}</dd></div><div><dt>Resultado</dt><dd>{outcomeLabels[latest.outcome]}</dd></div><div><dt>Calificación</dt><dd>{latest.score === null ? "Sin evaluar" : `${latest.score} / 100`}</dd></div></dl><div className="crm-result-flags"><CallStatusBadge status={latest.technical_status} /><PotentialBadge value={latest.is_potential_client} /><ModeBadge mode="mock" /></div></> : <p className="crm-summary">Este contacto todavía no tiene una conversación registrada.</p>}
      </Card>
      <Card className="crm-content-card"><h2 className="crm-panel-heading">Historial de llamadas <span className="crm-panel-kicker">{calls.length} intentos ficticios</span></h2>{calls.length ? calls.map((call) => <article key={call.id} className="crm-call-row"><div><time className="crm-call-date" dateTime={call.started_at}>{date(call.started_at)}</time><p className="crm-call-summary">{call.summary}</p></div><CallStatusBadge status={call.status as CallStatus} /></article>) : <p className="crm-quiet-note">Sin intentos de llamada.</p>}</Card>
      <Card className="crm-content-card"><h2 className="crm-panel-heading">Actividad del contacto</h2>{activities.length ? <ol className="crm-timeline">{activities.map((activity) => <li key={activity.id}><div>{activity.summary}</div><time dateTime={activity.occurred_at}>{date(activity.occurred_at)}</time></li>)}</ol> : <p className="crm-quiet-note">Sin actividad registrada todavía.</p>}</Card>
    </div><aside className="crm-contact-aside" aria-label="Datos y próxima acción">
      <Card className="crm-content-card"><h2 className="crm-panel-heading">Próxima acción</h2>{task ? <><div className="crm-next-task-kind">{taskLabels[task.kind]}</div><time className="crm-next-task-date" dateTime={task.due_at || undefined}>{date(task.due_at)}</time><p className="crm-next-task-reason">{task.reason}</p><TaskBadge task={task} /><Link className={buttonStyles({ className: "crm-tasks-link" })} href={`/tasks?demo=${data.demo}`}>Ver tareas</Link></> : <p className="crm-quiet-note">No hay acciones pendientes para este contacto.</p>}</Card>
      <Card className="crm-content-card"><h2 className="crm-panel-heading">Datos del contacto</h2><dl className="crm-info-list"><dt>Oportunidades</dt><dd>{deals.length ? deals.map((deal) => <div className="crm-deal-stage" key={deal.id}><StageBadge stage={deal.stage} /><span className="crm-cell-secondary">{deal.title}</span></div>) : "Sin oportunidad"}</dd><dt>Teléfono de ejemplo</dt><dd>{person.phone_e164}</dd><dt>Sitio web</dt><dd>{person.website ? <a href={person.website} target="_blank" rel="noopener noreferrer">{person.website.replace(/^https?:\/\//, "")}</a> : "Sin sitio web"}</dd><dt>Fuente</dt><dd>{sourceLabels[person.source.kind]}</dd><dt>Fecha de alta · Argentina</dt><dd><time dateTime={person.created_at}>{date(person.created_at)}</time></dd></dl></Card>
    </aside></div>
  </div>;
}

export function TasksView({ data }: { data: CrmDemoData }) {
  const [filter, setFilter] = useState("open");
  const [kind, setKind] = useState("all");
  const tasks = data.tasks.filter((task) => data.contacts.some((person) => person.id === task.contact_id))
    .filter((task) => filter === "all" || (filter === "open" ? isOpen(task) : task.status === filter))
    .filter((task) => kind === "all" || task.kind === kind)
    .sort((a, b) => (a.due_at || "9999").localeCompare(b.due_at || "9999"));
  return <div className="crm-view">
    <PageHeader title="Tareas" description="Organizá los seguimientos y las acciones que necesitan tu atención." />
    <div className="crm-metrics crm-metrics-three"><Metric label="Pendientes" value={data.tasks.filter((task) => task.status === "pending").length} hint="Por ejecutar" /><Metric label="Volver a llamar" value={data.tasks.filter((task) => task.kind === "callback" && isOpen(task)).length} hint="Seguimientos abiertos" /><Metric label="Revisión humana" value={data.tasks.filter((task) => task.kind === "human_review" && isOpen(task)).length} hint="Requieren una persona" /></div>
    <div className="crm-section-toolbar"><h2>Próximas acciones</h2><Select className="crm-task-filter" label="Tipo de tarea" hideLabel value={kind} onChange={(event) => setKind(event.target.value)} options={[{ value: "all", label: "Todos los tipos" }, { value: "callback", label: "Volver a llamar" }, { value: "human_review", label: "Revisión humana" }]} /><Select className="crm-task-filter" label="Filtrar tareas" hideLabel value={filter} onChange={(event) => setFilter(event.target.value)} options={[{ value: "open", label: "Abiertas" }, { value: "all", label: "Todas" }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} /></div>
    {!tasks.length ? <Empty title="Sin tareas para mostrar" description="No hay tareas que coincidan con estos filtros." /> : <Card padding="none" className="crm-table-panel"><table className="crm-task-table"><caption className="sr-only">Tareas de seguimiento</caption><thead><tr><th scope="col">Contacto</th><th scope="col">Próxima acción</th><th scope="col">Fecha · Argentina</th><th scope="col">Estado</th></tr></thead><tbody>{tasks.map((task) => {
      const person = data.contacts.find((item) => item.id === task.contact_id)!;
      const overdue = task.status === "pending" && task.due_at !== null && Date.parse(task.due_at) < Date.parse(data.now);
      return <tr key={task.id}><td><Link href={contactUrl(data, person.id)}>{person.name}</Link><span className="crm-cell-secondary">{person.organization}</span></td><td data-label="Acción"><strong>{taskLabels[task.kind]}</strong><p className="crm-task-reason">{task.reason}</p></td><td data-label="Fecha"><time dateTime={task.due_at || undefined}>{date(task.due_at)}</time>{overdue && <span className="crm-cell-secondary crm-overdue"><Clock size={12} aria-hidden />Vencida</span>}</td><td data-label="Estado"><TaskBadge task={task} />{task.status === "failed" && <span className="crm-cell-secondary">{errorLabels[task.error_code || ""] || "La tarea necesita revisión"}</span>}</td></tr>;
    })}</tbody></table></Card>}
    <p className="crm-quiet-note">Una tarea de llamada completada confirma el inicio del seguimiento. El cierre comercial se registra en la oportunidad.</p>
  </div>;
}
