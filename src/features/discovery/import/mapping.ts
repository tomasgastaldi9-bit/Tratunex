import { UpsertContactInputSchema, type UpsertContactInput } from "../../../contracts/crm";
import type { ProspectCandidate } from "../../../contracts/discovery";
import type { Result } from "../../../contracts/common";

function supportsCrmUrl(value: string | null): boolean {
  if (value === null) return true;
  try { return !new URL(value).hostname.toLowerCase().split(".").some((label) => label.startsWith("xn--")); }
  catch { return false; }
}
function unsupportedUrl(): Result<never> {
  return { ok: false, error: { code: "VALIDATION_ERROR", message: "El CRM todavía no admite dominios internacionalizados; revisá la web y la fuente.", retryable: false } };
}
export function toContactInput(candidate: ProspectCandidate, mode: "live" | "mock"): Result<UpsertContactInput> {
  if (mode !== "live") return { ok: false, error: { code: "VALIDATION_ERROR", message: "Los resultados mock no se importan como datos reales.", retryable: false } };
  if (!supportsCrmUrl(candidate.website) || !supportsCrmUrl(candidate.source_url)) return unsupportedUrl();
  const phone = candidate.phone?.replace(/[\s().-]/g, "") ?? "";
  const input = UpsertContactInputSchema.safeParse({ name: candidate.name, organization: null, phone_e164: phone, website: candidate.website, source: { kind: "firecrawl", label: "Búsqueda web", url: candidate.source_url } });
  if (!input.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El prospecto necesita datos válidos y un teléfono con código de país.", retryable: false } };
  return { ok: true, data: input.data };
}

export function csvRecordToContact(record: import("./csv").CsvProspect): Result<UpsertContactInput> {
  if (!supportsCrmUrl(record.website)) return unsupportedUrl();
  if (record.errors.length || !record.phone_e164) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El registro tiene errores y no se puede importar.", retryable: false } };
  const input = UpsertContactInputSchema.safeParse({ name: record.name, organization: null, phone_e164: record.phone_e164, website: record.website, source: { kind: "csv", label: "Archivo CSV", url: null } });
  if (!input.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El registro no cumple el contrato de contacto.", retryable: false } };
  return { ok: true, data: input.data };
}

export function mapPersistedCandidates(ids: string[], rows: (ProspectCandidate & { id: string; prospect_searches: { mode: "live" | "mock" } })[]): Result<UpsertContactInput[]> {
  if (rows.length !== ids.length || new Set(ids).size !== ids.length) return { ok: false, error: { code: "NOT_FOUND", message: "No se pudieron consultar los prospectos de esta empresa.", retryable: false } };
  const inputs: UpsertContactInput[] = [];
  for (const id of ids) {
    const row = rows.find(item => item.id === id);
    if (!row) return { ok: false, error: { code: "NOT_FOUND", message: "No se pudieron consultar los prospectos de esta empresa.", retryable: false } };
    const mapped = toContactInput(row, row.prospect_searches.mode);
    if (!mapped.ok) return mapped;
    inputs.push(mapped.data);
  }
  return { ok: true, data: inputs };
}
