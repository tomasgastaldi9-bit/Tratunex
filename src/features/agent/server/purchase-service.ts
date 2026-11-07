import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { actionCtxSchema, ctxSchema } from "../../../contracts/common";
import {
  checkPurchasePolicyInputSchema,
  createPurchaseRequestOutputSchema,
  decidePurchasePolicy,
  purchasePolicySchema,
  purchaseRequestInputSchema,
  purchaseRequestSchema,
} from "../../../contracts/purchases";
import type {
  CheckPurchasePolicy,
  CreatePurchaseRequest,
  GetPurchasePolicy,
  GetPurchaseRequest,
  PurchasePolicy,
  SavePurchasePolicy,
} from "../../../contracts/purchases";
import { fail, logError, translateSaveError } from "./save-errors";

/**
 * Lógica de las compras (BUY-01) y de las reglas de pago (BUY-02).
 * NO tiene "server-only" a propósito: así los tests la pueden importar.
 * Recibe una función que entrega el cliente de Supabase; en los tests le
 * pasamos uno falso.
 */

const LECTURA_NO_DISPONIBLE = "No pudimos leer los datos de compras. Probá de nuevo en un rato.";
const GUARDADO_NO_DISPONIBLE = "No pudimos guardar. Revisá tu conexión y probá de nuevo.";

/**
 * Valida un monto que viene de la base. Los selects piden los montos con ::text
 * (PostgREST devuelve numeric como número JSON, y un número de 23 dígitos ya se
 * redondeó al leerlo). Si igual llega un número, lo rechazamos: con plata no
 * adivinamos. Devuelve null si no es un texto de dígitos.
 */
function toAtomicText(value: unknown): string | null {
  return typeof value === "string" && /^\d+$/.test(value) ? value : null;
}

/**
 * safeParse que nunca tira: el contrato compara montos con BigInt en un refine
 * que corre aun si el texto no es un número (p. ej. "1.5"), y eso lanzaría una
 * excepción. Acá la convertimos en un error de validación normal.
 */
function safeParseSinExcepcion<T>(schema: z.ZodType<T>, value: unknown): { success: true; data: T } | { success: false; message: string } {
  try {
    const parsed = schema.safeParse(value);
    return parsed.success ? parsed : { success: false, message: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  } catch {
    return { success: false, message: "Escribí un monto válido, sin comas ni puntos" };
  }
}

/** La fecha de la base viene como "AAAA-MM-DD" (a veces con hora); nos quedamos con el día. */
function toDateText(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const day = value.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(day) ? day : null;
}

type ReadPolicy = { ok: true; policy: PurchasePolicy | null } | { ok: false; result: ReturnType<typeof fail> };

export function createPurchaseService(getClient: () => Promise<SupabaseClient>) {
  /** Lee las reglas de la empresa (o null si no hay). Lo usan getPurchasePolicy y checkPurchasePolicy. */
  async function readPolicy(client: SupabaseClient, companyId: string): Promise<ReadPolicy> {
    // company_id viene del servidor (ctx), nunca del navegador.
    const read = await client
      .from("purchase_policies")
      .select("max_per_purchase_atomic::text, auto_pay_limit_atomic::text, only_allowed_suppliers, allowed_supplier_ids")
      .eq("company_id", companyId)
      .maybeSingle();
    if (read.error) {
      logError("falló la lectura de purchase_policies", read.error);
      return { ok: false, result: fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true) };
    }
    if (read.data === null || read.data === undefined) return { ok: true, policy: null };

    const row = read.data as Record<string, unknown>;
    const max = toAtomicText(row.max_per_purchase_atomic);
    const auto = toAtomicText(row.auto_pay_limit_atomic);
    if (max === null || auto === null) {
      return { ok: false, result: fail("PROVIDER_ERROR", "Las reglas guardadas tienen un monto inesperado.", false) };
    }
    // Revisamos la fila: si la base tiene algo raro, no inventamos reglas.
    const policy = purchasePolicySchema.safeParse({
      max_per_purchase_atomic: max,
      auto_pay_limit_atomic: auto,
      only_allowed_suppliers: row.only_allowed_suppliers,
      allowed_supplier_ids: row.allowed_supplier_ids,
    });
    if (!policy.success) {
      return { ok: false, result: fail("PROVIDER_ERROR", "Las reglas guardadas tienen un formato inesperado.", false) };
    }
    return { ok: true, policy: policy.data };
  }

  const createPurchaseRequest: CreatePurchaseRequest = async (ctx, input) => {
    const parsedCtx = actionCtxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    // Usamos el valor parseado: viene normalizado (textos sin espacios sobrantes).
    const parsedInput = safeParseSinExcepcion(purchaseRequestInputSchema, input);
    if (!parsedInput.success) {
      return fail("VALIDATION_ERROR", parsedInput.message, false);
    }
    // Solo una persona puede crear la compra; la voz o el sistema no.
    if (parsedCtx.data.actor_type !== "user") {
      return fail("FORBIDDEN", "Solo una persona de la empresa puede crear una compra.", false);
    }

    let result: { data: unknown; error: { message?: string; code?: string } | null };
    try {
      const client = await getClient();
      result = await client.rpc("create_purchase_request", {
        p_company_id: parsedCtx.data.company_id,
        p_action_id: parsedCtx.data.action_id,
        p_request: parsedInput.data,
      });
    } catch (error) {
      logError("excepción al llamar a create_purchase_request", error);
      return fail("PROVIDER_UNAVAILABLE", GUARDADO_NO_DISPONIBLE, true);
    }
    if (result.error) return translateSaveError(result.error, "create_purchase_request");

    const output = createPurchaseRequestOutputSchema.safeParse(result.data);
    if (!output.success) return fail("PROVIDER_ERROR", "La base respondió algo inesperado al guardar.", false);
    return { ok: true, data: output.data };
  };

  const getPurchaseRequest: GetPurchaseRequest = async (ctx, input) => {
    const parsedCtx = ctxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    const id = z.uuid().safeParse(input?.purchase_request_id);
    if (!id.success) return fail("VALIDATION_ERROR", "La compra que pediste no es válida.", false);

    let row: unknown;
    try {
      const client = await getClient();
      // Filtramos por id Y por la empresa del ctx: una compra de otra empresa es "no existe".
      const read = await client
        .from("purchase_requests")
        .select("id, product, quantity, unit, needed_by, budget_atomic::text, zone, status, created_at, created_by")
        .eq("id", id.data)
        .eq("company_id", parsedCtx.data.company_id)
        .maybeSingle();
      if (read.error) {
        logError("falló la lectura de purchase_requests", read.error);
        return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
      }
      row = read.data;
    } catch (error) {
      logError("excepción al leer la compra", error);
      return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
    }

    if (row === null || row === undefined) return fail("NOT_FOUND", "No encontramos esa compra.", false);

    const raw = row as Record<string, unknown>;
    const budget = toAtomicText(raw.budget_atomic);
    const neededBy = toDateText(raw.needed_by);
    if (budget === null || neededBy === null) {
      return fail("PROVIDER_ERROR", "La compra guardada tiene un formato inesperado.", false);
    }
    const parsed = purchaseRequestSchema.safeParse({ ...raw, budget_atomic: budget, needed_by: neededBy });
    if (!parsed.success) return fail("PROVIDER_ERROR", "La compra guardada tiene un formato inesperado.", false);
    return { ok: true, data: { purchase_request: parsed.data } };
  };

  const getPurchasePolicy: GetPurchasePolicy = async (ctx) => {
    const parsedCtx = ctxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }

    try {
      const client = await getClient();
      const policy = await readPolicy(client, parsedCtx.data.company_id);
      if (!policy.ok) return policy.result;

      // Quién puede editar lo decide la base: la RLS solo deja ver la propia
      // membresía, así que esta fila es la de la persona de la sesión.
      const member = await client
        .from("company_members")
        .select("role")
        .eq("company_id", parsedCtx.data.company_id)
        .maybeSingle();
      if (member.error) {
        logError("falló la lectura de company_members", member.error);
        return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
      }
      const role = (member.data as { role?: unknown } | null)?.role;
      return { ok: true, data: { policy: policy.policy, can_edit: role === "admin" } };
    } catch (error) {
      logError("excepción al leer las reglas de pago", error);
      return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
    }
  };

  const savePurchasePolicy: SavePurchasePolicy = async (ctx, input) => {
    const parsedCtx = actionCtxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    const parsedInput = safeParseSinExcepcion(z.object({ policy: purchasePolicySchema }), input);
    if (!parsedInput.success) {
      return fail("VALIDATION_ERROR", parsedInput.message, false);
    }
    if (parsedCtx.data.actor_type !== "user") {
      return fail("FORBIDDEN", "Solo una persona admin puede cambiar las reglas de pago.", false);
    }

    let result: { data: unknown; error: { message?: string; code?: string } | null };
    try {
      const client = await getClient();
      result = await client.rpc("save_purchase_policy", {
        p_company_id: parsedCtx.data.company_id,
        p_action_id: parsedCtx.data.action_id,
        p_policy: parsedInput.data.policy,
      });
    } catch (error) {
      logError("excepción al llamar a save_purchase_policy", error);
      return fail("PROVIDER_UNAVAILABLE", GUARDADO_NO_DISPONIBLE, true);
    }
    if (result.error) {
      const message = result.error.message ?? "";
      // Casos propios de las reglas de pago (van antes del traductor general).
      if (message.startsWith("VALIDATION_ERROR: unknown supplier")) {
        return fail("VALIDATION_ERROR", "Uno de los proveedores elegidos no es de tu empresa. Recargá la página.", false);
      }
      if (result.error.code === "42501" || message.startsWith("FORBIDDEN")) {
        return fail("FORBIDDEN", "Solo una persona admin de la empresa puede cambiar las reglas de pago.", false);
      }
      return translateSaveError(result.error, "save_purchase_policy");
    }

    const output = z.object({ policy: purchasePolicySchema }).safeParse(result.data);
    if (!output.success) return fail("PROVIDER_ERROR", "La base respondió algo inesperado al guardar.", false);
    return { ok: true, data: output.data };
  };

  const checkPurchasePolicy: CheckPurchasePolicy = async (ctx, input) => {
    const parsedCtx = ctxSchema.safeParse(ctx);
    if (!parsedCtx.success) {
      return fail("VALIDATION_ERROR", parsedCtx.error.issues[0]?.message ?? "Contexto inválido", false);
    }
    const parsedInput = safeParseSinExcepcion(checkPurchasePolicyInputSchema, input);
    if (!parsedInput.success) {
      return fail("VALIDATION_ERROR", parsedInput.message, false);
    }

    let policy: ReadPolicy;
    try {
      const client = await getClient();
      policy = await readPolicy(client, parsedCtx.data.company_id);
    } catch (error) {
      logError("excepción al leer las reglas para chequear un pago", error);
      return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);
    }
    // Si no pudimos leer las reglas, NUNCA devolvemos "paga solo": devolvemos error.
    if (!policy.ok) return fail("PROVIDER_UNAVAILABLE", LECTURA_NO_DISPONIBLE, true);

    // La regla vive en el contrato; acá no se reimplementa.
    return {
      ok: true,
      data: decidePurchasePolicy(policy.policy, parsedInput.data.amount_atomic, parsedInput.data.supplier_contact_id),
    };
  };

  return { createPurchaseRequest, getPurchaseRequest, getPurchasePolicy, savePurchasePolicy, checkPurchasePolicy };
}
