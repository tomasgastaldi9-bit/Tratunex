import { z } from "zod";
import { resultSchema, type Result } from "../../../contracts/common";
import { SupplierDTOSchema, type SupplierDTO } from "../../../contracts/crm";

const supplierResponseSchema = resultSchema(z.object({ supplier: SupplierDTOSchema, created: z.boolean().optional() }));
export type SavedSupplier = { supplier: SupplierDTO; created?: boolean };

function matchesWallet(input: unknown, supplier: SupplierDTO) {
  if (!input || typeof input !== "object" || !("collection_wallet" in input)) return true;
  const requested = input.collection_wallet;
  if (requested === null) return supplier.collection_wallet === null;
  if (!requested || typeof requested !== "object" || !("chain" in requested) || !("address" in requested)
    || typeof requested.address !== "string") return false;
  const registered = supplier.collection_wallet;
  return registered !== null && registered.chain === requested.chain
    && registered.address.toLowerCase() === requested.address.toLowerCase();
}

export async function saveSupplierAction(url: string, method: "POST" | "PATCH", action_id: string,
  input: unknown, companyId: string, supplierId?: string): Promise<Result<SavedSupplier>> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, { method, credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input }) });
    const result = supplierResponseSchema.safeParse(await response.json());
    if (!result.success) throw new Error("No se recibió una confirmación válida del proveedor.");
    if (result.data.ok) {
      const supplier = result.data.data.supplier;
      if (!response.ok || supplier.company_id !== companyId || (supplierId && supplier.id !== supplierId) || !matchesWallet(input, supplier)) {
        throw new Error("El servidor no confirmó los datos solicitados para este proveedor.");
      }
    }
    return result.data;
  } finally { clearTimeout(timeout); }
}

export function supplierActionMessage(code: string, kind: "supplier" | "wallet"): string {
  if (code === "CONFLICT") return kind === "wallet"
    ? "La billetera cambió desde que abriste la ficha. Actualizá y revisá los datos antes de volver a guardar."
    : "El teléfono o dominio coincide con otro contacto, o los datos cambiaron. Actualizá la ficha y revisá los registros.";
  const messages: Record<string, string> = {
    VALIDATION_ERROR: "Revisá los campos y completá los datos requeridos.",
    FORBIDDEN: "Revisá tu sesión y la empresa activa antes de guardar.",
    NOT_FOUND: "El proveedor ya no está disponible en esta empresa. Volvé a la lista y actualizala.",
    PROVIDER_ERROR: "No pudimos confirmar el guardado. Reintentá la misma acción para recuperar su resultado.",
    PROVIDER_UNAVAILABLE: "No pudimos confirmar el guardado. Reintentá la misma acción para recuperar su resultado.",
    RATE_LIMITED: "Se alcanzó el límite de acciones. Esperá antes de reintentar.",
  };
  return messages[code] ?? "No pudimos confirmar el cambio. Revisá los datos guardados antes de hacer otro.";
}
