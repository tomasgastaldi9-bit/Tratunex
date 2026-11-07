import { describe, expect, it } from "vitest";
import {
  actionCtxSchema,
  ctxSchema,
  errorCodeSchema,
  resultSchema,
} from "./common";

const ctx = {
  company_id: "11111111-1111-4111-8111-111111111111",
  actor_type: "user" as const,
  actor_id: "22222222-2222-4222-8222-222222222222",
};

describe("common server contracts", () => {
  it("parses a context with company and actor identity", () => {
    expect(ctxSchema.parse(ctx)).toStrictEqual(ctx);
    expect(ctxSchema.safeParse({ ...ctx, actor_type: "model" }).success).toBe(false);
    expect(ctxSchema.safeParse({ ...ctx, company_id: "" }).success).toBe(false);
  });

  it("requires a non-empty action id", () => {
    expect(actionCtxSchema.parse({ ...ctx, action_id: "action-123" })).toMatchObject({
      ...ctx,
      action_id: "action-123",
    });
    expect(actionCtxSchema.safeParse({ ...ctx, action_id: " " }).success).toBe(false);
  });

  it("parses both success and error result branches", () => {
    const schema = resultSchema(ctxSchema);

    expect(schema.parse({ ok: true, data: ctx })).toStrictEqual({ ok: true, data: ctx });
    expect(
      schema.parse({
        ok: false,
        error: { code: "CONFLICT", message: "Action was reused", retryable: false },
      }),
    ).toMatchObject({ ok: false, error: { code: "CONFLICT", retryable: false } });
    expect(schema.safeParse({ ok: false, error: { ...ctx } }).success).toBe(false);
  });

  it("exposes exactly the brief's error code union", () => {
    expect(errorCodeSchema.options).toStrictEqual([
      "VALIDATION_ERROR",
      "NOT_FOUND",
      "FORBIDDEN",
      "CONFLICT",
      "PROVIDER_ERROR",
      "PROVIDER_UNAVAILABLE",
      "RATE_LIMITED",
    ]);
    expect(errorCodeSchema.safeParse("INTERNAL_ERROR").success).toBe(false);
  });
});
