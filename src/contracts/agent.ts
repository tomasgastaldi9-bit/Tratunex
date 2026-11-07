import { z } from "zod";
import type { ActionCtx, Ctx, Result } from "./common";

/**
 * Contrato del módulo Agente (dueña: Vale). BRIEF §5, §7 y §10.
 *
 * Acá se define la FORMA de los datos del agente: qué campos tiene cada parte,
 * qué valores acepta y qué devuelven las funciones públicas del módulo.
 * Lo usan el formulario (para validar), el servidor (para validar de nuevo) y
 * otros módulos (por ejemplo Voz, con getAgentConfig en AGT-05).
 *
 * Regla del equipo: una vez publicado, solo se AGREGAN campos. Nunca se
 * cambia ni se borra uno que ya exista, porque rompería a quien lo usa.
 *
 * Las decisiones de estructura están explicadas en src/features/agent/README.md.
 */

// ---------------------------------------------------------------------------
// Constantes
// ---------------------------------------------------------------------------

/** Zona horaria en la que se interpreta el horario de llamadas. */
export const AGENT_TIMEZONE = "America/Argentina/Buenos_Aires";

/** Máximo de caracteres de cada texto largo del perfil (todo entra en el prompt). */
export const PROFILE_TEXT_MAX = 600;

/** Máximo de caracteres de la zona ("CABA y GBA", "Todo el país"). */
export const PROFILE_ZONE_MAX = 120;

// ---------------------------------------------------------------------------
// Rubro, tono y días: listas cerradas con su texto en español
// ---------------------------------------------------------------------------

/** Rubro de la empresa. Coincide con las plantillas de AGT-07. */
export const industrySchema = z.enum(["distributor", "agency", "professional_services", "saas", "other"]);
export type Industry = z.infer<typeof industrySchema>;

/** Texto que ve la persona (y que usa el prompt) para cada rubro. */
export const INDUSTRY_LABELS: Record<Industry, string> = {
  distributor: "Distribuidora",
  agency: "Agencia",
  professional_services: "Servicios profesionales",
  saas: "SaaS / software",
  other: "Otro",
};

/** Cómo habla el agente en la llamada. */
export const toneSchema = z.enum(["professional_warm", "formal", "relaxed"]);
export type Tone = z.infer<typeof toneSchema>;

export const TONE_LABELS: Record<Tone, string> = {
  professional_warm: "Profesional y cercano",
  formal: "Formal",
  relaxed: "Relajado",
};

/** Días de la semana en formato ISO: 1 = lunes … 7 = domingo. */
export const weekdaySchema = z.number().int().min(1).max(7);
export type Weekday = z.infer<typeof weekdaySchema>;

export const WEEKDAY_LABELS: Record<Weekday, string> = {
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
  7: "Domingo",
};

// ---------------------------------------------------------------------------
// Horario de llamadas
// ---------------------------------------------------------------------------

/** Hora en formato 24 h con dos dígitos: "09:00", "18:30". */
const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Escribí la hora como 09:00");

/**
 * Franja en la que el agente puede llamar, en hora de Argentina.
 * Una sola franja para todos los días elegidos (ej. lunes a viernes de 9 a 18).
 *
 * Los días se guardan ordenados y sin repetir: así dos perfiles iguales se
 * guardan exactamente igual y la base puede detectar "no hubo cambios".
 */
export const callWindowSchema = z
  .object({
    days: z
      .array(weekdaySchema)
      .min(1, "Elegí al menos un día para llamar")
      .transform((days) => [...new Set(days)].sort((a, b) => a - b)),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  // Como las horas tienen siempre dos dígitos, compararlas como texto alcanza.
  .refine((window) => window.start < window.end, {
    error: "La hora de fin tiene que ser después de la de inicio",
    path: ["end"],
  });
export type CallWindow = z.infer<typeof callWindowSchema>;

// ---------------------------------------------------------------------------
// Perfil de empresa (AGT-01)
// ---------------------------------------------------------------------------

/** Texto largo obligatorio: sin espacios sobrantes, ni vacío ni demasiado largo. */
function requiredText(campo: string) {
  return z
    .string()
    .trim()
    .min(1, `Completá ${campo}`)
    .max(PROFILE_TEXT_MAX, `Usá como máximo ${PROFILE_TEXT_MAX} caracteres`);
}

/** Lo que el agente sabe de la empresa: qué vende, a quién, cómo habla y cuándo llama. */
export const companyProfileSchema = z.object({
  industry: industrySchema,
  offering: requiredText("qué vende la empresa"),
  target_customer: requiredText("a quién le vende"),
  value_proposition: requiredText("la propuesta de valor"),
  /** Opcional: puede quedar vacío. */
  zone: z.string().trim().max(PROFILE_ZONE_MAX, `Usá como máximo ${PROFILE_ZONE_MAX} caracteres`),
  tone: toneSchema,
  call_window: callWindowSchema,
});
export type CompanyProfile = z.infer<typeof companyProfileSchema>;

/** Valores con los que arranca el formulario la primera vez. */
export const DEFAULT_CALL_WINDOW: CallWindow = { days: [1, 2, 3, 4, 5], start: "09:00", end: "18:00" };
export const DEFAULT_TONE: Tone = "professional_warm";

// ---------------------------------------------------------------------------
// Versiones
// ---------------------------------------------------------------------------

/**
 * Una versión del agente: la "foto" de toda su configuración en un momento.
 * Cada guardado de cualquier sección crea la versión siguiente (1, 2, 3…).
 * Las llamadas guardan este número (agent_version en CallResultV1).
 *
 * Por ahora solo trae el perfil. AGT-03 agrega `instructions`, AGT-04
 * `criteria` y AGT-02 el conocimiento, como campos NUEVOS.
 */
export const agentProfileVersionSchema = z.object({
  version: z.number().int().min(1),
  profile: companyProfileSchema,
  /** Cuándo se creó, en ISO UTC. */
  created_at: z.string(),
  /** Usuario que la creó (null si ese usuario ya no existe). */
  created_by: z.string().nullable(),
});
export type AgentProfileVersion = z.infer<typeof agentProfileVersionSchema>;

// ---------------------------------------------------------------------------
// Funciones públicas (src/features/agent/server/public.ts)
// ---------------------------------------------------------------------------

/** Lo que devuelve getAgentProfile. */
export const getAgentProfileOutputSchema = z.object({
  /** La última versión, o null si la empresa todavía no configuró nada. */
  current: agentProfileVersionSchema.nullable(),
  /** true si la persona puede guardar cambios (solo los admin). */
  can_edit: z.boolean(),
});
export type GetAgentProfileOutput = z.infer<typeof getAgentProfileOutputSchema>;

/** Lo que recibe saveCompanyProfile. */
export const saveCompanyProfileInputSchema = z.object({
  /**
   * Versión sobre la que estaba editando la persona (null si es la primera).
   * Si mientras tanto alguien guardó otra, se responde CONFLICT en vez de pisarla.
   */
  base_version: z.number().int().min(1).nullable(),
  profile: companyProfileSchema,
});
export type SaveCompanyProfileInput = z.infer<typeof saveCompanyProfileInputSchema>;

/** Lo que devuelve saveCompanyProfile. */
export const saveCompanyProfileOutputSchema = z.object({
  /** Versión vigente después de guardar. */
  version: z.number().int().min(1),
  /** false si el perfil era igual al último: no se creó una versión nueva. */
  created: z.boolean(),
});
export type SaveCompanyProfileOutput = z.infer<typeof saveCompanyProfileOutputSchema>;

/**
 * Firmas de las funciones públicas. Errores posibles (ErrorCode de common.ts):
 *  - VALIDATION_ERROR: datos inválidos.
 *  - FORBIDDEN: no es miembro de la empresa, o no es admin (al guardar).
 *  - CONFLICT: alguien guardó otra versión mientras editaba, o se reusó un
 *    action_id con otros datos.
 *  - PROVIDER_UNAVAILABLE: la base no respondió (retryable: true).
 */
export type GetAgentProfile = (ctx: Ctx) => Promise<Result<GetAgentProfileOutput>>;
export type SaveCompanyProfile = (
  ctx: ActionCtx,
  input: SaveCompanyProfileInput,
) => Promise<Result<SaveCompanyProfileOutput>>;
