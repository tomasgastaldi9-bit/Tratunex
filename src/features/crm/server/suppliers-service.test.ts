import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ActionCtx, Result } from "../../../contracts/common";
import {
  UpsertContactInputSchema, type SetSupplierWalletInput, type SupplierDTO, type UpsertContactInput,
} from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";
import { createSuppliersCrm } from "./suppliers-service";

const contact = fixtures.contacts[0];
const ctx: ActionCtx = {
  company_id: contact.company_id, actor_type: "user",
  actor_id: "90000000-0000-4000-8000-000000000001", action_id: "supplier-stable-action",
};
// Constructed hexadecimal fixture; no ownership, checksum or balance assertion.
const address = `0x${"aB".repeat(20)}`;
const supplier: SupplierDTO = {
  ...contact, source: { ...contact.source, kind: "manual" }, is_supplier: true,
  collection_wallet: { chain: "base", address }, wallet_version: 2,
  wallet_updated_at: "2026-11-07T12:00:00Z",
};
const input = UpsertContactInputSchema.parse({
  name: contact.name, organization: contact.organization, phone_e164: contact.phone_e164,
  website: contact.website, source: contact.source,
});
const walletInput: SetSupplierWalletInput = {
  contact_id: contact.id, collection_wallet: { chain: "base", address }, expected_wallet_version: 1,
};

describe("ORD-01: servicio público de proveedores", () => {
  it("conserva la firma base del importador sin aceptar metadatos de billetera", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { supplier, created: false } }, error: null }));
    const crm = createSuppliersCrm(execute);
    expectTypeOf(crm.upsertSupplier).toEqualTypeOf<(ctx: ActionCtx, input: UpsertContactInput) => Promise<Result<{ supplier: SupplierDTO; created: boolean }>>>();
    expect(await crm.upsertSupplier(ctx, input)).toMatchObject({ ok: true, data: { supplier: { collection_wallet: supplier.collection_wallet }, created: false } });
    expect(execute).toHaveBeenCalledWith(ctx, "upsertSupplier", input);
    execute.mockClear();
    for (const extra of [
      { collection_wallet: walletInput.collection_wallet }, { wallet_version: 10 },
      { company_id: fixtures.companies[1].id }, { actor_type: "user" },
    ]) {
      expect(await crm.upsertSupplier(ctx, { ...input, ...extra } as UpsertContactInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("permite importadores conocidos sin darles campos de billetera", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { supplier, created: false } }, error: null }));
    const crm = createSuppliersCrm(execute);
    for (const actor_type of ["voice", "system"] as const) {
      const actor = { ...ctx, actor_type };
      expect(await crm.upsertSupplier(actor, input)).toMatchObject({ ok: true, data: { supplier: { collection_wallet: supplier.collection_wallet } } });
      expect(execute).toHaveBeenCalledWith(actor, "upsertSupplier", input);
    }
  });

  it.each(["voice", "system"] as const)("bloquea %s antes de ejecutar cambios de billetera o edición", async actor_type => {
    const execute = vi.fn();
    const crm = createSuppliersCrm(execute);
    const actor = { ...ctx, actor_type };
    expect(await crm.setSupplierWallet(actor, walletInput)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await crm.setSupplierWallet(actor, { ...walletInput, collection_wallet: null })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(await crm.updateSupplier(actor, { ...input, contact_id: contact.id })).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(execute).not.toHaveBeenCalled();
  });

  it("rechaza actores e identidad persistente inválidos antes del executor", async () => {
    const execute = vi.fn();
    const crm = createSuppliersCrm(execute);
    for (const changed of [
      { ...ctx, actor_type: "model" }, { ...ctx, actor_id: "untrusted-actor" },
      { ...ctx, company_id: "untrusted-company" }, { ...ctx, action_id: "" },
    ]) {
      expect(await crm.upsertSupplier(changed as ActionCtx, input)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("valida dirección, dirección cero y red antes de ejecutar la mutación", async () => {
    const execute = vi.fn();
    const crm = createSuppliersCrm(execute);
    const invalidWallets = [
      { chain: "base", address: "0x1234" },
      { chain: "base", address: `0x${"0".repeat(40)}` },
      { chain: "base", address: ` ${address}` },
      { chain: "base", address: `0x${"g".repeat(40)}` },
      { chain: "base-sepolia", address },
      { address },
    ];
    for (const collection_wallet of invalidWallets) {
      expect(await crm.setSupplierWallet(ctx, { ...walletInput, collection_wallet } as SetSupplierWalletInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("requiere una versión esperada entera no negativa", async () => {
    const execute = vi.fn();
    const crm = createSuppliersCrm(execute);
    for (const expected_wallet_version of [-1, 0.5, undefined]) {
      expect(await crm.setSupplierWallet(ctx, { ...walletInput, expected_wallet_version } as SetSupplierWalletInput)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    }
    expect(execute).not.toHaveBeenCalled();
  });

  it("conserva acción, versión esperada y casing al confirmar o reintentar", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { supplier } }, error: null }));
    const crm = createSuppliersCrm(execute);
    const first = await crm.setSupplierWallet(ctx, walletInput);
    expect(first).toMatchObject({ ok: true, data: { supplier: { collection_wallet: { chain: "base", address } } } });
    expect(await crm.setSupplierWallet(ctx, walletInput)).toEqual(first);
    expect(execute).toHaveBeenNthCalledWith(1, ctx, "setSupplierWallet", walletInput);
    expect(execute).toHaveBeenNthCalledWith(2, ctx, "setSupplierWallet", walletInput);
  });

  it("permite borrar el destino explícitamente sin omitir la versión esperada", async () => {
    const cleared = { ...supplier, collection_wallet: null, wallet_version: 3 };
    const execute = vi.fn(async () => ({ data: { ok: true, data: { supplier: cleared } }, error: null }));
    const clearInput = { ...walletInput, collection_wallet: null, expected_wallet_version: 2 };
    expect(await createSuppliersCrm(execute).setSupplierWallet(ctx, clearInput)).toMatchObject({ ok: true, data: { supplier: { collection_wallet: null, wallet_version: 3 } } });
    expect(execute).toHaveBeenCalledWith(ctx, "setSupplierWallet", clearInput);
  });

  it("normaliza wallet_updated_at a UTC y vuelve a consultar en cada lectura", async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce({ data: { ok: true, data: { supplier: { ...supplier, wallet_updated_at: "2026-11-07T09:00:00-03:00" } } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { supplier: { ...supplier, wallet_version: 3, wallet_updated_at: "2026-11-07T12:05:00+00:00" } } }, error: null });
    const crm = createSuppliersCrm(execute);
    expect(await crm.getSupplier(ctx, { contact_id: contact.id })).toMatchObject({ ok: true, data: { supplier: { wallet_updated_at: "2026-11-07T12:00:00.000Z", wallet_version: 2 } } });
    expect(await crm.getSupplier(ctx, { contact_id: contact.id })).toMatchObject({ ok: true, data: { supplier: { wallet_updated_at: "2026-11-07T12:05:00.000Z", wallet_version: 3 } } });
    expect(execute).toHaveBeenCalledTimes(2);
    expect(execute).toHaveBeenCalledWith({ company_id: ctx.company_id, actor_type: ctx.actor_type, actor_id: ctx.actor_id }, "getSupplier", { contact_id: contact.id });
  });

  it("no sustituye por fixtures una RPC de proveedores ausente", async () => {
    const execute = vi.fn(async () => ({ data: null, error: { code: "PGRST202", message: "Could not find public.suppliers_execute" } }));
    const crm = createSuppliersCrm(execute);
    expect(await crm.getSupplier(ctx, { contact_id: contact.id })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(await crm.listSuppliers(ctx, { limit: 50 })).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(execute).toHaveBeenCalledTimes(2);
  });

  it("rechaza un proveedor o una página de otra empresa sin exponer su contenido", async () => {
    const foreign = { ...supplier, company_id: fixtures.companies[1].id, name: "Proveedor ajeno" };
    const execute = vi.fn()
      .mockResolvedValueOnce({ data: { ok: true, data: { supplier: foreign } }, error: null })
      .mockResolvedValueOnce({ data: { ok: true, data: { items: [supplier, foreign], next_cursor: null } }, error: null });
    const crm = createSuppliersCrm(execute);
    for (const result of [await crm.getSupplier(ctx, { contact_id: contact.id }), await crm.listSuppliers(ctx, { limit: 50 })]) {
      expect(result).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
      expect(JSON.stringify(result)).not.toContain(foreign.name);
    }
  });

  it("valida el DTO completo y pasa filtros sin autoridad ni action_id de mutación", async () => {
    const execute = vi.fn(async () => ({ data: { ok: true, data: { items: [supplier], next_cursor: null } }, error: null }));
    const filters = { limit: 50, query: "  Demo  ", source: "csv" as const, wallet_status: "configured" as const, do_not_contact: "false" as const };
    expect(await createSuppliersCrm(execute).listSuppliers(ctx, filters)).toMatchObject({ ok: true, data: { items: [{ id: supplier.id }] } });
    expect(execute).toHaveBeenCalledWith({ company_id: ctx.company_id, actor_type: ctx.actor_type, actor_id: ctx.actor_id }, "listSuppliers", { ...filters, query: "Demo" });
    const malformed = vi.fn(async () => ({ data: { ok: true, data: { supplier: { ...supplier, collection_wallet: { chain: "base", address: "invalid" } } } }, error: null }));
    expect(await createSuppliersCrm(malformed).getSupplier(ctx, { contact_id: contact.id })).toMatchObject({ ok: false, error: { code: "PROVIDER_ERROR" } });
  });

  it("conserva CONFLICT y deja explícito un resultado de red no confirmado sin reintentos", async () => {
    const conflict = { ok: false, error: { code: "CONFLICT", message: "La billetera cambió", retryable: false } };
    const execute = vi.fn(async () => ({ data: conflict, error: null }));
    expect(await createSuppliersCrm(execute).setSupplierWallet(ctx, walletInput)).toEqual(conflict);
    const unavailable = vi.fn(async () => { throw new Error("Connection lost after commit"); });
    expect(await createSuppliersCrm(unavailable).setSupplierWallet(ctx, walletInput)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
    expect(unavailable).toHaveBeenCalledTimes(1);
  });
});
