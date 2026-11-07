import { z } from "zod";

export const errorCodeSchema = z.enum([
  "VALIDATION_ERROR",
  "NOT_FOUND",
  "FORBIDDEN",
  "CONFLICT",
  "PROVIDER_ERROR",
  "PROVIDER_UNAVAILABLE",
  "RATE_LIMITED",
]);

const requiredIdentifierSchema = z.string().refine((value) => value.trim().length > 0, {
  message: "Must not be empty",
});

export const ctxSchema = z.object({
  company_id: requiredIdentifierSchema,
  actor_type: z.enum(["user", "voice", "system"]),
  actor_id: requiredIdentifierSchema,
});

export const actionCtxSchema = ctxSchema.extend({
  action_id: requiredIdentifierSchema,
});

export const resultErrorSchema = z.object({
  code: errorCodeSchema,
  message: z.string(),
  retryable: z.boolean(),
});

export function resultSchema<TData extends z.ZodType>(dataSchema: TData) {
  return z.discriminatedUnion("ok", [
    z.object({ ok: z.literal(true), data: dataSchema }),
    z.object({ ok: z.literal(false), error: resultErrorSchema }),
  ]);
}

export type Ctx = z.infer<typeof ctxSchema>;
export type ActionCtx = z.infer<typeof actionCtxSchema>;
export type ErrorCode = z.infer<typeof errorCodeSchema>;
export type Result<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ErrorCode; message: string; retryable: boolean } };
