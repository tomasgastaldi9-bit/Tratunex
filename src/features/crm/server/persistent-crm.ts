import { z } from "zod";
import { actionCtxSchema, ctxSchema, resultSchema, type ActionCtx, type Ctx, type ErrorCode, type Result } from "../../../contracts/common";
import {
  crmOperationSchemas, UpdateContactInputSchema, ContactListInputSchema,
  ContactPageSchema, type UpsertContactInput, type GetContactInput,
  type UpdateContactInput, type ContactListInput,
} from "../../../contracts/crm";

export type DatabaseError = { code?: string; message?: string };
export type CrmRpcResponse = { data: unknown; error: DatabaseError | null };
export type CrmExecutor = (ctx: Ctx | ActionCtx, operation: string, input: unknown) => Promise<CrmRpcResponse>;

export function crmFailure<T>(code: ErrorCode, message: string, retryable = false): Result<T> {
  return { ok: false, error: { code, message, retryable } };
}

// Only timestamp columns are normalized. UUIDs, provider IDs and text stay literal.
const timestampKeys = new Set(["created_at", "updated_at", "occurred_at", "due_at", "lease_expires_at", "started_at", "call_started_at"]);
export function normalizeCrmDates(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(normalizeCrmDates);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => {
      if (timestampKeys.has(key) && typeof entry === "string" && /^\d{4}-\d\d-\d\dT.*(?:Z|[+-]\d\d:\d\d)$/.test(entry) && Number.isFinite(Date.parse(entry))) {
        return [key, new Date(entry).toISOString()];
      }
      return [key, normalizeCrmDates(entry)];
    }));
  }
  return value;
}

export function databaseFailure<T>(error: DatabaseError): Result<T> {
  const known: ErrorCode[] = ["VALIDATION_ERROR", "NOT_FOUND", "FORBIDDEN", "CONFLICT", "PROVIDER_ERROR", "PROVIDER_UNAVAILABLE", "RATE_LIMITED"];
  const prefix = error.message?.split(":", 1)[0];
  if (known.includes(prefix as ErrorCode)) {
    const code = prefix as ErrorCode;
    // DB functions publish a safe, intentional message after this code.
    return crmFailure(code, error.message!.slice(prefix!.length + 1).trim(), code === "PROVIDER_UNAVAILABLE");
  }
  if (error.code === "42501") return crmFailure("FORBIDDEN", "No tenés permiso para acceder a estos datos.");
  if (error.code === "23505" || error.code === "40001" || error.code === "40P01") return crmFailure("CONFLICT", "Los datos cambiaron. Consultá el estado antes de reintentar.", error.code !== "23505");
  if (error.code === "42P01" || error.code === "42883" || error.code === "PGRST202" || error.code === "PGRST205") {
    return crmFailure("PROVIDER_UNAVAILABLE", "El esquema CRM todavía no está disponible en esta base.", true);
  }
  return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo consultar el CRM. Conservá la misma acción si necesitás reintentar.", true);
}

const identitySchema = ctxSchema.extend({ company_id: z.uuid(), actor_id: z.uuid() });
const mutationIdentitySchema = actionCtxSchema.extend({ company_id: z.uuid(), actor_id: z.uuid() });

function belongsToCompany(value: unknown, companyId: string): boolean {
  if (Array.isArray(value)) return value.every(item => belongsToCompany(item, companyId));
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return (!Object.hasOwn(record, "company_id") || record.company_id === companyId) &&
      Object.values(record).every(item => belongsToCompany(item, companyId));
  }
  return true;
}

/** Real transactional adapter. Persistence and authority are enforced again in SQL. */
export function createPersistentCrm(execute: CrmExecutor) {
  async function call<I, O>(ctx: Ctx | ActionCtx, operation: string, input: I,
    inputSchema: z.ZodType<I>, dataSchema: z.ZodType<O>, mutation = true): Promise<Result<O>> {
    const context = (mutation ? mutationIdentitySchema : identitySchema).safeParse(ctx);
    const payload = inputSchema.safeParse(input);
    if (!context.success || !payload.success) return crmFailure("VALIDATION_ERROR", "Revisá los datos y el identificador de la acción.");
    try {
      const response = await execute(context.data, operation, payload.data);
      if (response.error) return databaseFailure(response.error);
      const result = resultSchema(dataSchema).safeParse(normalizeCrmDates(response.data));
      if (!result.success) return crmFailure("PROVIDER_ERROR", "La base devolvió un resultado CRM incompatible. No se confirmó la operación.");
      if (result.data.ok && !belongsToCompany(result.data.data, context.data.company_id)) {
        return crmFailure("PROVIDER_ERROR", "La operación devolvió datos fuera de la empresa activa.");
      }
      return result.data as Result<O>;
    } catch {
      return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo confirmar el resultado. Consultá el estado y conservá la misma acción al reintentar.", true);
    }
  }
  const operations = crmOperationSchemas;
  return {
    getContact: (ctx: Ctx, input: GetContactInput) => call(ctx, "getContact", input, operations.getContact.input, operations.getContact.data, false),
    upsertContact: (ctx: ActionCtx, input: UpsertContactInput) => call(ctx, "upsertContact", input, operations.upsertContact.input, operations.upsertContact.data),
    updateContact: (ctx: ActionCtx, input: UpdateContactInput) => call(ctx, "updateContact", input, UpdateContactInputSchema, operations.getContact.data),
    listContacts: (ctx: Ctx, input: ContactListInput) => call(ctx, "listContacts", input, ContactListInputSchema, ContactPageSchema, false),
  };
}
