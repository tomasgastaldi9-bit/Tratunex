import { z } from "zod";
import { resultSchema, type Result } from "../../../contracts/common";
import { ContactDTOSchema, type ContactDTO } from "../../../contracts/crm";

const contactResponseSchema = resultSchema(z.object({ contact: ContactDTOSchema, created: z.boolean().optional() }));
export type SavedContact = { contact: ContactDTO; created?: boolean };

/** Only a hash of the input is stored; contact fields stay out of sessionStorage. */
export async function contactActionId(scope: string, input: unknown): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(input)));
  const signature = Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
  const key = `tratunex-contact-intent:${scope}`;
  try {
    const previous: unknown = JSON.parse(sessionStorage.getItem(key) ?? "null");
    if (previous && typeof previous === "object" && "signature" in previous && previous.signature === signature &&
      "id" in previous && typeof previous.id === "string") return previous.id;
  } catch { /* Private browsing can disable storage; the form also keeps the ID in memory. */ }
  const id = crypto.randomUUID();
  try { sessionStorage.setItem(key, JSON.stringify({ signature, id })); } catch { /* Optional persistence. */ }
  return id;
}

export function clearContactAction(scope: string) {
  try { sessionStorage.removeItem(`tratunex-contact-intent:${scope}`); } catch { /* Optional persistence. */ }
}

export async function saveContactAction(url: string, method: "POST" | "PATCH", action_id: string,
  input: unknown, companyId: string): Promise<Result<SavedContact>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method, credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": action_id },
      body: JSON.stringify({ action_id, input }) });
    const result = contactResponseSchema.safeParse(await response.json());
    if (!result.success || (result.data.ok && (!response.ok || result.data.data.contact.company_id !== companyId))) {
      throw new Error("El servicio no confirmó un contacto válido para esta empresa.");
    }
    return result.data;
  } finally { clearTimeout(timeout); }
}

export function contactActionMessage(code: string): string {
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "Revisá los datos del contacto y completá los campos requeridos.",
    FORBIDDEN: "Revisá tu sesión y la empresa activa antes de guardar.",
    NOT_FOUND: "El contacto ya no está disponible en esta empresa. Volvé a la lista y actualizala.",
    CONFLICT: "El teléfono o dominio pertenece a otro contacto, o los datos cambiaron. Actualizá la ficha y revisá los registros antes de guardar.",
    PROVIDER_ERROR: "El servicio no confirmó el guardado. Reintentá con los mismos datos para recuperar el resultado.",
    PROVIDER_UNAVAILABLE: "No pudimos confirmar el guardado. Reintentá con los mismos datos para recuperar el resultado.",
    RATE_LIMITED: "Se alcanzó el límite de acciones. Esperá antes de reintentar.",
  };
  return messages[code] ?? "No pudimos guardar el contacto. Revisá su estado antes de hacer otro cambio.";
}
