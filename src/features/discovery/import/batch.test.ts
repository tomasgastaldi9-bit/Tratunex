import { describe, expect, it, vi } from "vitest";
import { importBatch } from "./batch";

const ctx = { company_id: "company", actor_id: "actor", actor_type: "user" as const, action_id: "batch-1" };
const inputs = [{ name: "Una", organization: null, phone_e164: "+12025550123", website: null, source: { kind: "csv" as const, label: "CSV", url: null } }];

describe("importación", () => {
  it("reserva el lote y conserva la acción de cada contacto al reintentar", async () => {
    const reserve = vi.fn().mockResolvedValue({ ok: true, data: null });
    const upsert = vi.fn().mockResolvedValue({ ok: true, data: { created: true, contact: { id: "contact" } } });
    const first = await importBatch(ctx, inputs, { reserve, upsert });
    const second = await importBatch(ctx, inputs, { reserve, upsert });
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, data: { imported: 1, existing: 0, failed: 0, contact_ids: ["contact"] } });
    expect(upsert.mock.calls[0][0].action_id).toBe(upsert.mock.calls[1][0].action_id);
    expect(reserve).toHaveBeenCalledBefore(upsert);
  });
  it("no modifica contactos si la reserva detecta reutilización distinta", async () => {
    const reserve = vi.fn().mockResolvedValue({ ok: false, error: { code: "CONFLICT", message: "Conflicto", retryable: false } });
    const upsert = vi.fn();
    expect(await importBatch(ctx, inputs, { reserve, upsert })).toMatchObject({ ok: false, error: { code: "CONFLICT" } });
    expect(upsert).not.toHaveBeenCalled();
  });
  it("informa errores parciales y reintenta con las mismas claves", async () => {
    const reserve = vi.fn().mockResolvedValue({ ok: true, data: null });
    const upsert = vi.fn().mockResolvedValueOnce({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Sin conexión", retryable: true } }).mockResolvedValueOnce({ ok: true, data: { created: true, contact: { id: "contact" } } });
    const first = await importBatch(ctx, inputs, { reserve, upsert });
    const second = await importBatch(ctx, inputs, { reserve, upsert });
    expect(first).toMatchObject({ ok: true, data: { failed: 1, errors: [{ row: 1, retryable: true }] } });
    expect(second).toMatchObject({ ok: true, data: { failed: 0, imported: 1 } });
    expect(upsert.mock.calls[0][0].action_id).toBe(upsert.mock.calls[1][0].action_id);
  });
});
