import { z } from "zod";
import { resultSchema, type Result } from "../../../contracts/common";
import { ContactDTOSchema, ContactPageSchema, DealDTOSchema, type ContactDTO, type ContactPage, type DealDTO } from "../../../contracts/crm";

const dealResponseSchema = resultSchema(z.object({ deal: DealDTOSchema }));
const contactResponseSchema = resultSchema(z.object({ contact: ContactDTOSchema }));
export type SavedDeal = { deal: DealDTO };

export async function savePipelineAction(url: string, action_id: string, input: { contact_id?: string; deal_id?: string; stage?: string },
  companyId: string, expectedDealId?: string): Promise<Result<SavedDeal>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input }) });
    const result = dealResponseSchema.safeParse(await response.json());
    if (!result.success) throw new Error("La oportunidad no tiene una confirmación válida.");
    if (result.data.ok) {
      const deal = result.data.data.deal;
      if (!response.ok || deal.company_id !== companyId || (expectedDealId && deal.id !== expectedDealId)
        || (input.contact_id && deal.contact_id !== input.contact_id) || (input.stage && deal.stage !== input.stage)) {
        throw new Error("El servidor no confirmó la oportunidad solicitada.");
      }
    }
    return result.data;
  } finally { clearTimeout(timeout); }
}

export async function searchPipelineContacts(companyId: string, query: string, cursor?: string): Promise<Result<ContactPage>> {
  const params = new URLSearchParams({ limit: "50" });
  if (query.trim()) params.set("query", query.trim());
  if (cursor) params.set("cursor", cursor);
  const response = await fetch(`/api/crm/contacts?${params}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = resultSchema(ContactPageSchema).safeParse(await response.json());
  if (!result.success || (result.data.ok && (!response.ok || result.data.data.items.some(contact => contact.company_id !== companyId)))) {
    throw new Error("No pudimos obtener una lista de contactos válida para esta empresa.");
  }
  return result.data;
}

export async function readPipelineContact(companyId: string, id: string): Promise<Result<{ contact: ContactDTO }>> {
  const response = await fetch(`/api/crm/contacts/${encodeURIComponent(id)}`, { credentials: "same-origin", cache: "no-store", signal: AbortSignal.timeout(15_000) });
  const result = contactResponseSchema.safeParse(await response.json());
  if (!result.success || (result.data.ok && (!response.ok || result.data.data.contact.company_id !== companyId))) {
    throw new Error("No pudimos obtener el contacto de esta empresa.");
  }
  return result.data;
}

export function pipelineActionMessage(code: string): string {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "Elegí un contacto y revisá los datos de la oportunidad.",
    FORBIDDEN: "Revisá tu sesión y la empresa activa antes de guardar.",
    NOT_FOUND: "El contacto o la oportunidad ya no está disponible en esta empresa. Actualizá el tablero.",
    CONFLICT: "La oportunidad cambió desde que abriste el tablero. Actualizá y revisá la etapa antes de guardar nuevamente.",
    PROVIDER_ERROR: "No pudimos confirmar el guardado. Reintentá con los mismos datos para recuperar el resultado.",
    PROVIDER_UNAVAILABLE: "No pudimos confirmar el guardado. Reintentá con los mismos datos para recuperar el resultado.",
    RATE_LIMITED: "Se alcanzó el límite de acciones. Esperá antes de reintentar.",
  };
  return messages[code] ?? "No pudimos confirmar el cambio. Revisá el estado de la oportunidad antes de hacer otro.";
}
