"use server";
import { z } from "zod";
import { getCompanyContext } from "@/features/platform/server/public";
import { searchProspects } from "@/features/discovery/server/public";
import type { Candidate } from "@/features/discovery/server/search";

export type SearchState = { error?: string; result?: { search_id: string; candidates: (Candidate & { id: string })[]; mode: "mock" | "live" }; actionId: string };
export async function submitSearch(previous: SearchState, form: FormData): Promise<SearchState> {
  const actionId = form.get("action_id");
  if (!z.uuid().safeParse(actionId).success) return { actionId: crypto.randomUUID(), error: "No se pudo iniciar la búsqueda." };
  const context = await getCompanyContext();
  if (!context.ok) return { actionId: actionId as string, error: context.error.message };
  const result = await searchProspects(context.data, { query: form.get("query"), location: form.get("location"), limit: 5 }, actionId as string);
  if (!result.ok) return { actionId: "safe_to_restart" in result ? crypto.randomUUID() : actionId as string, error: result.error.message };
  return { actionId: crypto.randomUUID(), result: result.data };
}
