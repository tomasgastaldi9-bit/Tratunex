"use server";
import { z } from "zod";
import { getCompanyContext } from "@/features/platform/server/public";
import { addSupplierFromCandidate, importProspects, searchProspects } from "@/features/discovery/server/public";
import type { Candidate } from "@/features/discovery/server/search";

export type SearchState = { error?: string; result?: { search_id: string; candidates: (Candidate & { id: string; importActionId: string })[]; mode: "mock" | "live" }; actionId: string };
export async function submitSearch(previous: SearchState, form: FormData): Promise<SearchState> {
  const actionId = form.get("action_id");
  if (!z.uuid().safeParse(actionId).success) return { actionId: crypto.randomUUID(), error: "No se pudo iniciar la búsqueda." };
  const context = await getCompanyContext();
  if (!context.ok) return { actionId: actionId as string, error: context.error.message };
  const result = await searchProspects(context.data, { query: form.get("query"), location: form.get("location"), limit: 5 }, actionId as string);
  if (!result.ok) return { actionId: "safe_to_restart" in result ? crypto.randomUUID() : actionId as string, error: result.error.message };
  return { actionId: crypto.randomUUID(), result: { ...result.data, candidates: result.data.candidates.map(candidate => ({ ...candidate, importActionId: crypto.randomUUID() })) } };
}

export type ImportState = { actionId: string; message?: string; done?: boolean };
export async function submitImport(previous: ImportState, form: FormData): Promise<ImportState> {
  const actionId = form.get("action_id");
  if (typeof actionId !== "string" || !z.uuid().safeParse(actionId).success || actionId !== previous.actionId) return { ...previous, message: "La acción de importación no es válida." };
  const context = await getCompanyContext();
  if (!context.ok) return { ...previous, message: context.error.message };
  const csv = form.get("csv");
  const candidate = form.get("candidate_id");
  if (typeof csv !== "string" && typeof candidate !== "string") return { ...previous, message: "No hay registros para importar." };
  try {
    const result = await importProspects({ ...context.data, action_id: actionId }, typeof csv === "string" ? { csv } : { candidate_ids: [candidate as string] });
    if (!result.ok) return { ...previous, message: result.error.message };
    const { imported, existing, failed, errors } = result.data;
    return { actionId, done: failed === 0, message: `${imported} nuevos · ${existing} existentes · ${failed} con error.${errors.length ? ` ${errors.map(e => `Registro ${e.row}: ${e.message}`).join(" ")}` : ""}` };
  } catch { return { ...previous, message: "No se pudo confirmar el resultado. Reintentá con esta misma importación." }; }
}

export async function submitSupplier(previous: ImportState, form: FormData): Promise<ImportState> {
  const actionId = form.get("action_id");
  if (typeof actionId !== "string" || !z.uuid().safeParse(actionId).success || actionId !== previous.actionId) return { ...previous, message: "La acción de importación no es válida." };
  const context = await getCompanyContext();
  if (!context.ok) return { ...previous, message: context.error.message };
  const candidate = form.get("candidate_id");
  const phone = form.get("phone_e164");
  if (typeof candidate !== "string") return { ...previous, message: "No se encontró el proveedor seleccionado." };
  try {
    const result = await addSupplierFromCandidate({ ...context.data, action_id: actionId }, candidate, phone);
    if (!result.ok) return { ...previous, message: result.error.message };
    return { actionId, done: true, message: result.data.created ? "Proveedor agregado al CRM." : "El proveedor ya existía en el CRM; sus datos quedaron actualizados." };
  } catch { return { ...previous, message: "No se pudo confirmar el resultado. Reintentá con esta misma importación." }; }
}
