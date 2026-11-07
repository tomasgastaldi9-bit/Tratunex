import { ArrowRight, Bot, Phone, Plus, Search, Upload, Users } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { IconButton } from "@/components/ui/IconButton";
import { Input } from "@/components/ui/Input";
import { ListItem } from "@/components/ui/ListItem";
import { PageHeader } from "@/components/ui/PageHeader";
import { ProgressCard } from "@/components/ui/ProgressCard";
import { Select } from "@/components/ui/Select";
import { StatCard } from "@/components/ui/StatCard";
import {
  CallStatusBadge,
  ModeBadge,
  PIPELINE_STAGES,
  PotentialBadge,
  StageBadge,
  type CallStatus,
} from "@/components/ui/StatusBadges";
import { Textarea } from "@/components/ui/Textarea";

/**
 * VITRINA DE COMPONENTES: /ui
 *
 * Catálogo para el equipo: cada bloque muestra un componente funcionando y,
 * en "Ver código", lo que hay que copiar para usarlo en tu pantalla.
 *
 * TODOS LOS DATOS SON DE EJEMPLO (inventados). No vienen de la base ni de Vapi.
 */
export const metadata: Metadata = {
  title: "Vitrina de componentes · Tratunex",
};

// Contactos inventados para los ejemplos (sin teléfonos reales).
const CONTACTOS_EJEMPLO = [
  { nombre: "Ferretería del Sur", rubro: "Ferretería", cuando: "Hoy 10:30", etapa: "potential_client" },
  { nombre: "Estudio Contable Norte", rubro: "Servicios profesionales", cuando: "Hoy 09:15", etapa: "follow_up" },
  { nombre: "Agencia Marea", rubro: "Marketing", cuando: "Ayer 16:40", etapa: "contacted" },
] as const;

const ESTADOS_LLAMADA: CallStatus[] = ["queued", "ringing", "in_progress", "completed", "failed", "unknown"];

// Colores del sistema, para mostrarlos con su nombre de clase.
const COLORES = [
  { nombre: "canvas", clase: "bg-canvas", uso: "Fondo de página" },
  { nombre: "surface", clase: "bg-surface", uso: "Tarjetas y campos" },
  { nombre: "line", clase: "bg-line", uso: "Bordes" },
  { nombre: "ink-muted", clase: "bg-ink-muted", uso: "Texto secundario" },
  { nombre: "ink", clase: "bg-ink", uso: "Texto y botones" },
  { nombre: "info", clase: "bg-info", uso: "Oportunidad / dato" },
  { nombre: "success", clase: "bg-success", uso: "Salió bien" },
  { nombre: "warning", clase: "bg-warning", uso: "Hay que hacer algo" },
  { nombre: "danger", clase: "bg-danger", uso: "Salió mal / delicado" },
];

export default function VitrinaUI() {
  return (
    <AppShell>
      <PageHeader
        title="Vitrina de componentes"
        description="Todo lo que podés usar para armar pantallas. Abrí “Ver código” y copialo."
        actions={<ModeBadge mode="mock" />}
      />

      {/* ---------- Ejemplo de pantalla armada con los componentes ---------- */}
      <Seccion
        titulo="Así se ve una pantalla armada"
        descripcion="Primeros pasos, números y una lista, todo combinado."
        codigo={`<ProgressCard
  title="Configurá tu agente"
  steps={[
    { label: "Contale qué vende tu empresa", done: true },
    { label: "Definí cuándo alguien es cliente potencial", done: true },
    { label: "Probalo desde el navegador", done: false },
    { label: "Cargá tus primeros contactos", done: false },
  ]}
  action={<Button icon={ArrowRight}>Continuar</Button>}
/>
<StatCard value="12" label={"Llamadas\\nhoy"} />`}
      >
        <ProgressCard
          title="Configurá tu agente"
          steps={[
            { label: "Contale qué vende tu empresa", done: true },
            { label: "Definí cuándo alguien es cliente potencial", done: true },
            { label: "Probalo desde el navegador", done: false },
            { label: "Cargá tus primeros contactos", done: false },
          ]}
          action={<Button icon={ArrowRight}>Continuar</Button>}
        />
        <div className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <StatCard value="12" label={"Llamadas\nhoy"} />
          <StatCard value="04" label={"Clientes\npotenciales"} />
          <StatCard value="03" label={"Para volver\na llamar"} />
          <StatCard value="02" label={"Compraron"} />
        </div>
      </Seccion>

      {/* ---------- Botones ---------- */}
      <Seccion
        titulo="Botones"
        descripcion="Uno negro (primary) por sección: la acción más importante. El resto, secundarios."
        codigo={`import { Phone } from "lucide-react";

<Button icon={Phone}>Llamar ahora</Button>
<Button variant="secondary">Cancelar</Button>
<Button variant="ghost">Ver detalle</Button>
<Button variant="danger">Borrar contacto</Button>
<Button loading>Llamando…</Button>
<Button size="sm">Chico</Button>
<IconButton icon={ArrowRight} label="Siguiente" />

// Un link que se ve como botón:
<Link href="/agent" className={buttonStyles({ variant: "secondary" })}>Ir al agente</Link>`}
      >
        <div className="flex flex-wrap items-center gap-2.5">
          <Button icon={Phone}>Llamar ahora</Button>
          <Button variant="secondary">Cancelar</Button>
          <Button variant="ghost">Ver detalle</Button>
          <Button variant="danger">Borrar contacto</Button>
          <Button loading>Llamando…</Button>
          <Button size="sm">Chico</Button>
          <IconButton icon={ArrowRight} label="Siguiente" />
        </div>
      </Seccion>

      {/* ---------- Etiquetas de estado ---------- */}
      <Seccion
        titulo="Etiquetas de estado"
        descripcion="Listas para usar: no las armes a mano. El color dice qué significa y el ícono ayuda a quien no distingue colores."
        codigo={`<StageBadge stage="follow_up" />
<PotentialBadge value="yes" score={82} />
<ModeBadge mode="mock" />          // mock | web | live
<CallStatusBadge status="failed" />

// Si necesitás otra etiqueta, con su significado:
<Badge tone="warning" icon={Clock}>Revisar</Badge>   // neutral | strong | info | success | warning | danger`}
      >
        <Grupo titulo="Etapas del pipeline">
          {PIPELINE_STAGES.map((etapa) => (
            <StageBadge key={etapa} stage={etapa} />
          ))}
        </Grupo>
        <Grupo titulo="¿Es cliente potencial?">
          <PotentialBadge value="yes" score={82} />
          <PotentialBadge value="no" score={15} />
          <PotentialBadge value="unknown" />
        </Grupo>
        <Grupo titulo="¿Es de prueba o de verdad?">
          <ModeBadge mode="mock" />
          <ModeBadge mode="web" />
          <ModeBadge mode="live" />
        </Grupo>
        <Grupo titulo="Estado de una llamada">
          {ESTADOS_LLAMADA.map((estado) => (
            <CallStatusBadge key={estado} status={estado} />
          ))}
        </Grupo>
      </Seccion>

      {/* ---------- Formularios ---------- */}
      <Seccion
        titulo="Formularios"
        descripcion="Todos llevan título (label). Si algo está mal, el error dice qué pasó y cómo arreglarlo."
        codigo={`<Input label="Nombre de la empresa" placeholder="Distribuidora Sur" required />
<Input label="Buscar" hideLabel icon={Search} placeholder="Buscar contactos" />
<Input label="Teléfono" error="Falta el código de área. Ejemplo: +54 11 …" />
<Select
  label="Rubro"
  placeholder="Elegí un rubro"
  options={[{ value: "distribuidora", label: "Distribuidora" }]}
/>
<Textarea label="¿Qué vende tu empresa?" hint="Contalo como se lo dirías a un cliente." maxLength={500} />`}
      >
        <div className="grid gap-5 md:grid-cols-2">
          <Input label="Nombre de la empresa" placeholder="Distribuidora Sur" required />
          {/* md:self-end: como no muestra título, lo alineamos abajo con el campo de al lado. */}
          <Input
            label="Buscar contactos"
            hideLabel
            icon={Search}
            placeholder="Buscar contactos"
            type="search"
            className="md:self-end"
          />
          <Input label="Teléfono" placeholder="+54 11 …" error="Falta el código de área. Ejemplo: +54 11 …" />
          <Select
            label="Rubro"
            placeholder="Elegí un rubro"
            hint="Cargamos una plantilla según el rubro."
            options={[
              { value: "distribuidora", label: "Distribuidora" },
              { value: "agencia", label: "Agencia de marketing" },
              { value: "servicios", label: "Servicios profesionales" },
              { value: "saas", label: "Software (SaaS)" },
            ]}
          />
          <Textarea
            label="¿Qué vende tu empresa?"
            hint="Contalo como se lo dirías a un cliente."
            maxLength={500}
            placeholder="Vendemos insumos de oficina a empresas de zona norte…"
            className="md:col-span-2"
          />
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit">Guardar cambios</Button>
          <Button variant="secondary">Cancelar</Button>
        </div>
      </Seccion>

      {/* ---------- Avisos ---------- */}
      <Seccion
        titulo="Avisos"
        descripcion="Para confirmar que algo pasó o explicar un problema. Siempre: qué pasó y qué hacer."
        codigo={`<Alert tone="success" title="Agente guardado">La próxima llamada ya usa esta versión.</Alert>
<Alert tone="danger" title="No pudimos llamar" action={<Button size="sm">Reintentar</Button>}>
  Vapi no respondió. Probá de nuevo en un minuto.
</Alert>`}
      >
        <Alert tone="success" title="Agente guardado">
          La próxima llamada ya usa esta versión.
        </Alert>
        <Alert tone="info" title="Probando en el navegador">
          Esta llamada no usa el teléfono: hablás con el agente desde la compu.
        </Alert>
        <Alert tone="warning" title="Falta definir criterios">
          Sin criterios, el agente no puede decidir si alguien es cliente potencial.
        </Alert>
        <Alert
          tone="danger"
          title="No pudimos llamar"
          action={
            <Button size="sm" variant="secondary">
              Reintentar
            </Button>
          }
        >
          Vapi no respondió. Probá de nuevo en un minuto.
        </Alert>
      </Seccion>

      {/* ---------- Listas ---------- */}
      <Seccion
        titulo="Listas"
        descripcion="Una fila por contacto, llamada o tarea. En celular, lo de la derecha baja solo."
        codigo={`<ul className="flex flex-col gap-2.5">
  <li>
    <ListItem
      leading={<Avatar name="Ferretería del Sur" />}
      title="Ferretería del Sur"
      subtitle="Ferretería"
      meta={<StageBadge stage="potential_client" />}
      actions={<Button size="sm">Ver contacto</Button>}
    />
  </li>
</ul>`}
      >
        <ul className="flex flex-col gap-2.5">
          {CONTACTOS_EJEMPLO.map((contacto) => (
            <li key={contacto.nombre}>
              <ListItem
                leading={<Avatar name={contacto.nombre} />}
                title={contacto.nombre}
                subtitle={`${contacto.rubro} · ${contacto.cuando}`}
                meta={<StageBadge stage={contacto.etapa} />}
                actions={<Button size="sm">Ver contacto</Button>}
              />
            </li>
          ))}
        </ul>
      </Seccion>

      {/* ---------- Vacío ---------- */}
      <Seccion
        titulo="Cuando todavía no hay nada"
        descripcion="Nunca una pantalla en blanco: explicá qué va a aparecer y cuál es el primer paso."
        codigo={`<EmptyState
  icon={Users}
  title="Todavía no cargaste contactos"
  description="Importá una lista para que el agente empiece a llamar."
  action={<Button icon={Upload}>Importar contactos</Button>}
/>`}
      >
        <EmptyState
          icon={Users}
          title="Todavía no cargaste contactos"
          description="Importá una lista para que el agente empiece a llamar."
          action={<Button icon={Upload}>Importar contactos</Button>}
        />
      </Seccion>

      {/* ---------- Encabezado de pantalla ---------- */}
      <Seccion
        titulo="Encabezado de pantalla"
        descripcion="Uno por pantalla: título, una línea que explique para qué sirve y la acción principal."
        codigo={`<PageHeader
  title="Agente"
  description="Enseñale a tu agente qué vender y cuándo alguien es cliente potencial."
  actions={<Button icon={Bot}>Probar agente</Button>}
/>`}
      >
        <div className="rounded-card border border-dashed border-line p-5">
          <PageHeader
            title="Agente"
            description="Enseñale a tu agente qué vender y cuándo alguien es cliente potencial."
            actions={
              <>
                <Button variant="secondary" icon={Plus}>
                  Nueva versión
                </Button>
                <Button icon={Bot}>Probar agente</Button>
              </>
            }
          />
        </div>
      </Seccion>

      {/* ---------- Colores ---------- */}
      <Seccion
        titulo="Colores"
        descripcion="Usá siempre estos nombres (bg-surface, text-ink-muted, text-danger…), nunca colores sueltos."
        codigo={`<div className="bg-surface text-ink">…</div>
<p className="text-ink-muted">Texto secundario</p>
<p className="text-danger">Mensaje de error</p>
<div className="bg-warning-soft text-warning">Aviso</div>`}
      >
        <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-5">
          {COLORES.map((color) => (
            <li key={color.nombre} className="flex items-center gap-2.5">
              <span className={`size-10 shrink-0 rounded-control border border-line ${color.clase}`} aria-hidden />
              <span className="flex min-w-0 flex-col gap-1">
                <code className="text-xs font-bold">{color.nombre}</code>
                <span className="truncate text-xs text-ink-muted">{color.uso}</span>
              </span>
            </li>
          ))}
        </ul>
      </Seccion>
    </AppShell>
  );
}

/**
 * Bloque de la vitrina: título, explicación, el componente funcionando y el
 * código para copiar (escondido en un desplegable para que la página no sea eterna).
 */
function Seccion({
  titulo,
  descripcion,
  codigo,
  children,
}: {
  titulo: string;
  descripcion: string;
  codigo: string;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col gap-5 border-t border-line pt-8 first-of-type:border-t-0 first-of-type:pt-0">
      <div className="flex flex-col gap-2">
        <h2 className="text-xl leading-tight font-bold">{titulo}</h2>
        <p className="text-sm leading-snug text-ink-muted">{descripcion}</p>
      </div>
      {children}
      {/* <details>: desplegable nativo del navegador, accesible con teclado y sin JavaScript. */}
      <details className="group rounded-control bg-surface">
        <summary className="cursor-pointer px-4 py-3 text-sm font-bold select-none focus-visible:outline-2 focus-visible:outline-ink">
          Ver código
        </summary>
        <pre className="overflow-x-auto px-4 pb-4 text-xs leading-relaxed">
          <code>{codigo}</code>
        </pre>
      </details>
    </section>
  );
}

/** Fila de etiquetas con un subtítulo chico. */
function Grupo({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2.5">
      <p className="text-xs leading-none font-bold text-ink-muted">{titulo}</p>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}
