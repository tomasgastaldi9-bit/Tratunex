import type { IntegrationMode } from "@/components/ui/StatusBadges";
import type { CallResultV1, CallTransport, NextAction } from "@/contracts/voice";

// Textos de Voz para las pantallas. Los estados técnicos, el modo y "cliente
// potencial" usan las etiquetas compartidas de src/components/ui/StatusBadges.

export const OUTCOME_LABELS: Record<CallResultV1["outcome"], string> = {
  interested: "Interesado",
  not_interested: "No le interesa",
  callback_requested: "Pidió que lo llamen",
  wants_to_buy: "Quiere comprar",
  not_assessed: "Sin evaluar",
};

export const ANSWERED_BY_LABELS: Record<CallResultV1["answered_by"], string> = {
  human: "Atendió una persona",
  voicemail: "Contestador",
  unknown: "No se sabe quién atendió",
};

// En las etiquetas compartidas, "live" = llamada telefónica real.
export function transportMode(transport: CallTransport): IntegrationMode {
  return transport === "phone" ? "live" : transport;
}

const argentina = new Intl.DateTimeFormat("es-AR", {
  timeZone: "America/Argentina/Buenos_Aires",
  dateStyle: "medium",
  timeStyle: "short",
});

export function formatArgentina(iso: string): string {
  return argentina.format(new Date(iso));
}

export function nextActionLabel(nextAction: NextAction | null): string {
  if (!nextAction) return "Ninguna";
  if (nextAction.type === "callback") return `Volver a llamar: ${formatArgentina(nextAction.due_at)}`;
  return `Revisión de una persona: ${nextAction.reason}`;
}
