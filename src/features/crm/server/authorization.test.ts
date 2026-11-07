import { describe, expect, it, vi } from "vitest";
import type { Ctx, Result } from "../../../contracts/common";
import { authorizeCrmClient } from "./authorization";

const ctx: Ctx = { company_id: "10000000-0000-4000-8000-000000000001", actor_id: "90000000-0000-4000-8000-000000000001", actor_type: "user" };
function dependencies() {
  return {
    verifyUser: vi.fn(async (): Promise<Result<Ctx>> => ({ ok: true, data: ctx })),
    createUserClient: vi.fn(async () => "jwt-scoped-client"),
    createServiceClient: vi.fn(async (): Promise<Result<string>> => ({ ok: true, data: "trusted-service-client" })),
  };
}
describe("CRM client authorization boundary", () => {
  it("uses the user JWT after revalidating current membership, never a service client", async () => {
    const deps = dependencies();
    expect(await authorizeCrmClient(ctx, deps)).toEqual({ ok: true, data: "jwt-scoped-client" });
    expect(deps.verifyUser).toHaveBeenCalledWith(ctx.company_id);
    expect(deps.createServiceClient).not.toHaveBeenCalled();
  });
  it("rejects an impersonated actor and a stale or foreign company context", async () => {
    for (const changed of [{ ...ctx, actor_id: "90000000-0000-4000-8000-000000000002" }, { ...ctx, company_id: "10000000-0000-4000-8000-000000000002" }]) {
      const deps = dependencies();
      expect(await authorizeCrmClient(changed, deps)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
      expect(deps.createUserClient).not.toHaveBeenCalled();
      expect(deps.createServiceClient).not.toHaveBeenCalled();
    }
  });
  it("preserves denial of a revoked membership instead of escalating to service credentials", async () => {
    const deps = dependencies();
    deps.verifyUser.mockResolvedValue({ ok: false, error: { code: "FORBIDDEN", message: "Membresía revocada", retryable: false } });
    expect(await authorizeCrmClient(ctx, deps)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(deps.createUserClient).not.toHaveBeenCalled();
    expect(deps.createServiceClient).not.toHaveBeenCalled();
  });
  it("only accepts known trusted actor types and retains explicit missing-service errors", async () => {
    const deps = dependencies();
    expect(await authorizeCrmClient({ ...ctx, actor_type: "model" } as unknown as Ctx, deps)).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    expect(deps.createServiceClient).not.toHaveBeenCalled();
    deps.createServiceClient.mockResolvedValue({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Falta configuración", retryable: true } });
    expect(await authorizeCrmClient({ ...ctx, actor_type: "voice" }, deps)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
    expect(deps.verifyUser).not.toHaveBeenCalled();
  });
});
