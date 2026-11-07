import type { Result } from "@/contracts/common";
import { parseFirecrawlResults, type Candidate, type SearchInput } from "./search";

export async function searchProvider(input: SearchInput, mode: "mock" | "live", key?: string, fetcher: typeof fetch = fetch): Promise<Result<Candidate[]>> {
  if (mode === "mock") return { ok: true, data: [{ name: "Empresa de ejemplo (mock)", phone: null, website: "https://example.com", source_url: "https://example.com/", evidence: null }] };
  if (!key) return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Firecrawl no está configurado", retryable: false } };
  try {
    const response = await fetcher("https://api.firecrawl.dev/v2/search", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ query: `${input.query} ${input.location}`, limit: input.limit, sources: [{ type: "web" }], scrapeOptions: { formats: [{ type: "markdown" }, { type: "json", prompt: "Identify the company that owns this official website. Set is_official_website to false for directories, news, reviews, social networks, lists or uncertain ownership. Never invent a name.", schema: { type: "object", properties: { company_name: { type: ["string", "null"] }, is_official_website: { type: "boolean" } }, required: ["company_name", "is_official_website"] } }] }, timeout: 30000 }), signal: AbortSignal.timeout(35000) });
    if (!response.ok) return { ok: false, error: { code: response.status === 429 ? "RATE_LIMITED" : "PROVIDER_ERROR", message: "No se pudo completar la búsqueda en Firecrawl", retryable: response.status === 429 || response.status >= 500 } };
    return { ok: true, data: parseFirecrawlResults(await response.json(), input.limit) };
  } catch {
    return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo completar la búsqueda en Firecrawl", retryable: true } };
  }
}
