import "server-only";
import { createClient } from "@supabase/supabase-js";
import type { Ctx, Result } from "@/contracts/common";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { searchProvider } from "./provider";
import { parseSearchInput, type Candidate } from "./search";
export { importProspects } from "./import";
export { addSupplierFromCandidate } from "./supplier-import";

type SearchResult = { search_id: string; candidates: (Candidate & { id: string })[]; mode: "mock" | "live" };
export async function searchProspects(ctx: Ctx, raw: unknown, actionId: string = crypto.randomUUID()): Promise<Result<SearchResult> | { ok: false; error: { code: "PROVIDER_ERROR" | "PROVIDER_UNAVAILABLE" | "RATE_LIMITED"; message: string; retryable: boolean }; safe_to_restart: true }> {
  let input;
  try { input = parseSearchInput(raw); } catch { return { ok: false, error: { code: "VALIDATION_ERROR", message: "Completá rubro y zona", retryable: false } }; }
  const env = getServerEnv();
  if (!env.SUPABASE_SECRET_KEY) return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "El servicio de búsqueda no está configurado.", retryable: false } };
  try {
    const privileged = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const params = { p_company_id: ctx.company_id, p_action_id: actionId, p_query: input.query, p_location: input.location, p_limit: input.limit, p_mode: env.DISCOVERY_MODE };
    const { data: attempt, error: startError } = await privileged.rpc("begin_verified_prospect_search", { ...params, p_actor_id: ctx.actor_id });
    if (startError) return { ok: false, error: { code: startError.message.includes("CONFLICT") ? "CONFLICT" : "PROVIDER_ERROR", message: "No se pudo iniciar la búsqueda", retryable: false } };
    if (attempt.state === "completed") return { ok: true, data: { ...attempt.result, mode: env.DISCOVERY_MODE } };
    if (attempt.state !== "started") return { ok: false, error: { code: "CONFLICT", message: "Esta búsqueda ya fue iniciada y su resultado todavía no está disponible.", retryable: false } };
    const result = await searchProvider(input, env.DISCOVERY_MODE, env.FIRECRAWL_API_KEY);
    if (!result.ok) return { ...result, safe_to_restart: true };
    const { data, error } = await privileged.rpc("finish_verified_prospect_search", { ...params, p_actor_id: ctx.actor_id, p_candidates: result.data });
    if (error) return { ok: false, error: { code: "PROVIDER_ERROR", message: "La búsqueda terminó, pero no se pudo confirmar el guardado.", retryable: false } };
    return { ok: true, data: { ...data, mode: env.DISCOVERY_MODE } };
  } catch { return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo confirmar el estado de la búsqueda.", retryable: false } }; }
}

