import { describe, expect, expectTypeOf, it, vi } from "vitest";
import type { ActionCtx, Ctx, Result } from "../../../contracts/common";
import type {
  CallResultV1, ClaimDueFollowupsData, ClaimDueFollowupsInput, CompleteFollowupInput,
  FailFollowupInput, FollowupData, GetContactData, GetContactInput, RecordCallResultData,
  ScheduleFollowupInput, UpsertContactData, UpsertContactInput,
} from "../../../contracts/crm";
import fixtures from "../mocks/fixtures.json";

vi.mock("server-only", () => ({}));
vi.mock("./client", () => ({ getAuthorizedCrmClient: async () => ({
  ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "Base no configurada en esta prueba", retryable: true },
}) }));

import {
  claimDueFollowups, completeFollowup, crmIntegration, failFollowup, getContact,
  recordCallResult, scheduleFollowup, upsertContact,
} from "./public";
import { getContact as getMockContact } from "./mock-public";

describe("CRM-02: contrato público consumible sin base ni credenciales", () => {
  it("exporta las siete firmas con Ctx, ActionCtx y Result del contrato común", () => {
    expectTypeOf(getContact).toEqualTypeOf<(ctx: Ctx, input: GetContactInput) => Promise<Result<GetContactData>>>();
    expectTypeOf(upsertContact).toEqualTypeOf<(ctx: ActionCtx, input: UpsertContactInput) => Promise<Result<UpsertContactData>>>();
    expectTypeOf(recordCallResult).toEqualTypeOf<(ctx: ActionCtx, input: CallResultV1) => Promise<Result<RecordCallResultData>>>();
    expectTypeOf(scheduleFollowup).toEqualTypeOf<(ctx: ActionCtx, input: ScheduleFollowupInput) => Promise<Result<FollowupData>>>();
    expectTypeOf(claimDueFollowups).toEqualTypeOf<(ctx: ActionCtx, input: ClaimDueFollowupsInput) => Promise<Result<ClaimDueFollowupsData>>>();
    expectTypeOf(completeFollowup).toEqualTypeOf<(ctx: ActionCtx, input: CompleteFollowupInput) => Promise<Result<FollowupData>>>();
    expectTypeOf(failFollowup).toEqualTypeOf<(ctx: ActionCtx, input: FailFollowupInput) => Promise<Result<FollowupData>>>();
    for (const operation of [getContact, upsertContact, recordCallResult, scheduleFollowup, claimDueFollowups, completeFollowup, failFollowup]) {
      expect(operation).toBeTypeOf("function");
    }
  });

  it("declara el modo por operación sin fingir resultados reales de Voz", () => {
    expect(crmIntegration).toMatchObject({ mode: "mixed", operations: {
      getContact: "persisted", upsertContact: "persisted", recordCallResult: "mock",
    } });
  });

  it("permite leer un contacto ficticio desde la entrada pública", async () => {
    const fixture = fixtures.contacts[0];
    const ctx: Ctx = {
      company_id: fixture.company_id,
      actor_type: "user",
      actor_id: "30000000-0000-4000-8000-000000000001",
    };
    const result: Result<GetContactData> = await getMockContact(ctx, { contact_id: fixture.id });
    expect(result).toEqual({ ok: true, data: { contact: fixture } });
    expect(await getContact(ctx, { contact_id: fixture.id })).toMatchObject({
      ok: false, error: { code: "PROVIDER_UNAVAILABLE" },
    });
  });
});
