import {
  Ban,
  Check,
  CircleHelp,
  Clock,
  FlaskConical,
  Globe,
  LoaderCircle,
  Phone,
  PhoneCall,
  Sparkles,
  Star,
  ThumbsDown,
  ThumbsUp,
  X,
  type LucideIcon,
} from "lucide-react";
import { Badge, type BadgeTone } from "./Badge";

/**
 * Etiquetas LISTAS para los estados de Tratunex. Usalas en vez de armar una
 * <Badge> a mano: así una misma etapa se ve igual en el pipeline, en el detalle
 * de un contacto, en las llamadas y en el dashboard del agente.
 *
 *   <StageBadge stage="follow_up" />          → ámbar "En seguimiento"
 *   <PotentialBadge value="yes" score={82} />  → verde "Potencial: sí · 82/100"
 *   <ModeBadge mode="mock" />                 → ámbar "Datos de prueba"
 *   <CallStatusBadge status="failed" />        → rojo "Falló"
 *
 * Los códigos (new, follow_up, yes, mock...) son EXACTAMENTE los del BRIEF §8.
 * Están copiados acá porque todavía no existen los contratos de CRM y Voz;
 * cuando Nano publique src/contracts/crm.ts y Bautista src/contracts/voice.ts,
 * estos tipos tienen que importarse de ahí.
 *
 * Si necesitás solo el texto o el color (por ejemplo, para el título de una
 * columna del pipeline), usá los objetos exportados: STAGE_INFO["won"].label.
 */

type EstadoVisual = { label: string; tone: BadgeTone; icon: LucideIcon };

// ---------------------------------------------------------------------------
// Etapas del pipeline (BRIEF §8, "Etapas del pipeline")
// ---------------------------------------------------------------------------

export type PipelineStage =
  | "new"
  | "contacted"
  | "potential_client"
  | "follow_up"
  | "won"
  | "lost"
  | "disqualified";

/** Orden en el que se muestran las columnas del pipeline. */
export const PIPELINE_STAGES: PipelineStage[] = [
  "new",
  "contacted",
  "potential_client",
  "follow_up",
  "won",
  "lost",
  "disqualified",
];

export const STAGE_INFO: Record<PipelineStage, EstadoVisual> = {
  // Gris: todavía no pasó nada importante.
  new: { label: "Nuevo", tone: "neutral", icon: Sparkles },
  contacted: { label: "Contactado", tone: "neutral", icon: Phone },
  // Azul: es una oportunidad.
  potential_client: { label: "Cliente potencial", tone: "info", icon: Star },
  // Ámbar: hay algo pendiente (volver a llamar, revisar).
  follow_up: { label: "En seguimiento", tone: "warning", icon: Clock },
  // Verde / rojo: terminó bien o mal.
  won: { label: "Compró", tone: "success", icon: Check },
  lost: { label: "No compró", tone: "danger", icon: X },
  // Gris con ícono de "prohibido": no es el perfil o pidió que no lo llamen.
  disqualified: { label: "No calificado", tone: "neutral", icon: Ban },
};

export function StageBadge({ stage, className }: { stage: PipelineStage; className?: string }) {
  const info = STAGE_INFO[stage];
  return (
    <Badge tone={info.tone} icon={info.icon} className={className}>
      {info.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// ¿Es cliente potencial? (BRIEF §8, "Clasificación de cada llamada")
// ---------------------------------------------------------------------------

export type PotentialClient = "yes" | "no" | "unknown";

export const POTENTIAL_INFO: Record<PotentialClient, EstadoVisual> = {
  yes: { label: "Potencial: sí", tone: "success", icon: ThumbsUp },
  no: { label: "Potencial: no", tone: "danger", icon: ThumbsDown },
  // "unknown" se muestra como tal: nunca lo disfrazamos de sí o no (AGENTS.md).
  unknown: { label: "Potencial: no se sabe", tone: "neutral", icon: CircleHelp },
};

type PotentialBadgeProps = {
  value: PotentialClient;
  /** Puntaje de 0 a 100 según los criterios de la empresa. Opcional. */
  score?: number;
  className?: string;
};

export function PotentialBadge({ value, score, className }: PotentialBadgeProps) {
  const info = POTENTIAL_INFO[value];
  // Math.round: por si el puntaje viene con decimales (82.4 → 82).
  const puntaje = score === undefined ? "" : ` · ${Math.round(score)}/100`;
  return (
    <Badge tone={info.tone} icon={info.icon} className={className}>
      {info.label}
      {puntaje}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Modo: ¿es de prueba o de verdad? (AGENTS.md: "Distingue mock, voz web y voz
// telefónica real en código, interfaz, PR y demo")
// ---------------------------------------------------------------------------

export type IntegrationMode = "mock" | "web" | "live";

export const MODE_INFO: Record<IntegrationMode, EstadoVisual> = {
  // Ámbar: atención, esto NO es real.
  mock: { label: "Datos de prueba", tone: "warning", icon: FlaskConical },
  // Azul: voz real pero desde el navegador, sin teléfono.
  web: { label: "Voz en el navegador", tone: "info", icon: Globe },
  // Rojo: llamada telefónica de verdad (cuesta plata y llega a una persona real).
  live: { label: "Llamada real", tone: "danger", icon: PhoneCall },
};

export function ModeBadge({ mode, className }: { mode: IntegrationMode; className?: string }) {
  const info = MODE_INFO[mode];
  return (
    <Badge tone={info.tone} icon={info.icon} className={className}>
      {info.label}
    </Badge>
  );
}

// ---------------------------------------------------------------------------
// Estado técnico de una llamada (BRIEF §8)
// ---------------------------------------------------------------------------

export type CallStatus = "queued" | "ringing" | "in_progress" | "completed" | "failed" | "unknown";

export const CALL_STATUS_INFO: Record<CallStatus, EstadoVisual> = {
  queued: { label: "En cola", tone: "neutral", icon: Clock },
  ringing: { label: "Sonando", tone: "info", icon: PhoneCall },
  in_progress: { label: "En curso", tone: "info", icon: LoaderCircle },
  completed: { label: "Terminada", tone: "success", icon: Check },
  failed: { label: "Falló", tone: "danger", icon: X },
  // Ámbar: no sabemos qué pasó, alguien tiene que mirarlo.
  unknown: { label: "Estado desconocido", tone: "warning", icon: CircleHelp },
};

export function CallStatusBadge({ status, className }: { status: CallStatus; className?: string }) {
  const info = CALL_STATUS_INFO[status];
  return (
    <Badge tone={info.tone} icon={info.icon} className={className}>
      {info.label}
    </Badge>
  );
}
