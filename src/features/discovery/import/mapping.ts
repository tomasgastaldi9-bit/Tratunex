import { UpsertContactInputSchema, type UpsertContactInput } from "../../../contracts/crm";
import type { ProspectCandidate } from "../../../contracts/discovery";
import type { Result } from "../../../contracts/common";

export function toContactInput(candidate: ProspectCandidate, mode: "live" | "mock"): Result<UpsertContactInput> {
  if (mode !== "live") return { ok: false, error: { code: "VALIDATION_ERROR", message: "Los resultados mock no se importan como datos reales.", retryable: false } };
  const phone = candidate.phone?.replace(/[\s().-]/g, "") ?? "";
  const input = UpsertContactInputSchema.safeParse({ name: candidate.name, organization: null, phone_e164: phone, website: candidate.website, source: { kind: "firecrawl", label: "Búsqueda web", url: candidate.source_url } });
  if (!input.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El prospecto necesita datos válidos y un teléfono con código de país.", retryable: false } };
  return { ok: true, data: input.data };
}

export function csvRecordToContact(record: import("./csv").CsvProspect): Result<UpsertContactInput> {
  if (record.errors.length || !record.phone_e164) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El registro tiene errores y no se puede importar.", retryable: false } };
  const input = UpsertContactInputSchema.safeParse({ name: record.name, organization: null, phone_e164: record.phone_e164, website: record.website, source: { kind: "csv", label: "Archivo CSV", url: null } });
  if (!input.success) return { ok: false, error: { code: "VALIDATION_ERROR", message: "El registro no cumple el contrato de contacto.", retryable: false } };
  return { ok: true, data: input.data };
}
