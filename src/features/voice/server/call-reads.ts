import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
// Imports relativos: Vitest no resuelve el alias "@/" en imports de valores.
import { ctxSchema, type Result } from "../../../contracts/common";
import {
  CallDetailDTOSchema,
  GetCallInputSchema,
  ListCallsInputSchema,
  type CallDetailDTO,
  type GetCallData,
  type ListCallsData,
} from "../../../contracts/voice";
import { callDetailFixtures } from "../fixtures";

// Lectura de llamadas para /calls, /calls/[id] y el historial del CRM (TRA-49).

export type CallReader = {
  list: (ctx: unknown, input: unknown) => Promise<Result<ListCallsData>>;
  get: (ctx: unknown, input: unknown) => Promise<Result<GetCallData>>;
};

const DEFAULT_LIMIT = 50;
type Failure = Extract<Result<never>, { ok: false }>;

function failure(code: Failure["error"]["code"], message: string, retryable = false): Failure {
  return { ok: false, error: { code, message, retryable } };
}

function validCompanyId(ctx: unknown): string | null {
  const parsed = ctxSchema.safeParse(ctx);
  return parsed.success && z.uuid().safeParse(parsed.data.company_id).success ? parsed.data.company_id : null;
}

// Cursor opaco: fecha de creación + id de la última llamada de la página.
export function encodeCallCursor(call: { created_at: string; id: string }): string {
  return Buffer.from(`${call.created_at}|${call.id}`).toString("base64url");
}

export function decodeCallCursor(cursor: string): { created_at: string; id: string } | null {
  const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
  if (!createdAt || !id || Number.isNaN(Date.parse(createdAt)) || !z.uuid().safeParse(id).success) {
    return null;
  }
  return { created_at: createdAt, id };
}

function isAfterCursor(call: { created_at: string; id: string }, cursor: { created_at: string; id: string }): boolean {
  return call.created_at < cursor.created_at || (call.created_at === cursor.created_at && call.id < cursor.id);
}

function page(calls: CallDetailDTO[], limit: number): ListCallsData {
  const items = calls.slice(0, limit).map((call) => {
    const { transcript, ...item } = call;
    void transcript;
    return item;
  });
  const last = items.at(-1);
  return { items, next_cursor: calls.length > limit && last ? encodeCallCursor(last) : null };
}

// ---------------------------------------------------------------------------
// Mock: llamadas de ejemplo, mostradas como si fueran de la empresa activa.
// ---------------------------------------------------------------------------
export function createMockCallReader(fixtures: CallDetailDTO[] = callDetailFixtures): CallReader {
  const forCompany = (companyId: string) =>
    fixtures
      .map((call) => ({
        ...call,
        company_id: companyId,
        result: call.result ? { ...call.result, company_id: companyId } : null,
      }))
      .sort((a, b) => (a.created_at === b.created_at ? (a.id < b.id ? 1 : -1) : a.created_at < b.created_at ? 1 : -1));

  return {
    async list(ctx, input) {
      const companyId = validCompanyId(ctx);
      if (!companyId) return failure("VALIDATION_ERROR", "Contexto inválido");
      const parsed = ListCallsInputSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "Filtros de llamadas inválidos");
      const cursor = parsed.data.cursor ? decodeCallCursor(parsed.data.cursor) : null;
      if (parsed.data.cursor && !cursor) return failure("VALIDATION_ERROR", "Cursor inválido");

      const calls = forCompany(companyId)
        .filter((call) => !parsed.data.contact_id || call.contact_id === parsed.data.contact_id)
        .filter((call) => !cursor || isAfterCursor(call, cursor));
      return { ok: true, data: page(calls, parsed.data.limit ?? DEFAULT_LIMIT) };
    },

    async get(ctx, input) {
      const companyId = validCompanyId(ctx);
      if (!companyId) return failure("VALIDATION_ERROR", "Contexto inválido");
      const parsed = GetCallInputSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "ID de llamada inválido");
      const call = forCompany(companyId).find((candidate) => candidate.id === parsed.data.call_id);
      return call ? { ok: true, data: { call } } : failure("NOT_FOUND", "No existe esa llamada");
    },
  };
}

// ---------------------------------------------------------------------------
// Base de datos: tabla calls (migración de TRA-46) con la sesión del usuario.
// RLS ya limita a las empresas del usuario; además se filtra por la empresa activa.
// ---------------------------------------------------------------------------
const CALL_COLUMNS =
  "id, company_id, contact_id, deal_id, source_task_id, provider_call_id, transport, status, objective, agent_version, ended_reason, created_at, updated_at";

type CallRow = {
  id: string;
  company_id: string;
  contact_id: string;
  deal_id: string | null;
  source_task_id: string | null;
  provider_call_id: string | null;
  transport: string;
  status: string;
  objective: string | null;
  agent_version: number | null;
  ended_reason: string | null;
  created_at: string;
  updated_at: string;
};

// La base devuelve timestamps con zona "+00:00"; el contrato usa UTC con "Z".
function toDetail(row: CallRow): CallDetailDTO | null {
  const parsed = CallDetailDTOSchema.safeParse({
    ...row,
    created_at: new Date(row.created_at).toISOString(),
    updated_at: new Date(row.updated_at).toISOString(),
    // Se completan cuando Voz procese el reporte final (VOZ-07).
    ended_at: null,
    recording_url: null,
    transcript: null,
    result: null,
  });
  return parsed.success ? parsed.data : null;
}

export function createSupabaseCallReader(supabase: SupabaseClient): CallReader {
  return {
    async list(ctx, input) {
      const companyId = validCompanyId(ctx);
      if (!companyId) return failure("VALIDATION_ERROR", "Contexto inválido");
      const parsed = ListCallsInputSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "Filtros de llamadas inválidos");
      const cursor = parsed.data.cursor ? decodeCallCursor(parsed.data.cursor) : null;
      if (parsed.data.cursor && !cursor) return failure("VALIDATION_ERROR", "Cursor inválido");
      const limit = parsed.data.limit ?? DEFAULT_LIMIT;

      let query = supabase.from("calls").select(CALL_COLUMNS).eq("company_id", companyId);
      if (parsed.data.contact_id) query = query.eq("contact_id", parsed.data.contact_id);
      if (cursor) {
        query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
      }
      const { data, error } = await query
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit + 1);
      if (error) return failure("PROVIDER_UNAVAILABLE", "No se pudieron leer las llamadas", true);

      const calls = (data as CallRow[]).map(toDetail);
      if (calls.some((call) => call === null)) return failure("PROVIDER_ERROR", "Hay llamadas con datos inválidos");
      return { ok: true, data: page(calls as CallDetailDTO[], limit) };
    },

    async get(ctx, input) {
      const companyId = validCompanyId(ctx);
      if (!companyId) return failure("VALIDATION_ERROR", "Contexto inválido");
      const parsed = GetCallInputSchema.safeParse(input);
      if (!parsed.success) return failure("VALIDATION_ERROR", "ID de llamada inválido");

      const { data, error } = await supabase
        .from("calls")
        .select(CALL_COLUMNS)
        .eq("company_id", companyId)
        .eq("id", parsed.data.call_id)
        .maybeSingle();
      if (error) return failure("PROVIDER_UNAVAILABLE", "No se pudo leer la llamada", true);
      if (!data) return failure("NOT_FOUND", "No existe esa llamada");

      const call = toDetail(data as CallRow);
      return call ? { ok: true, data: { call } } : failure("PROVIDER_ERROR", "La llamada tiene datos inválidos");
    },
  };
}
