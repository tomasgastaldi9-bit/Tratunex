import { z } from "zod";

const modeSchema = z.enum(["mock", "live"]).default("mock");

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
  NEXT_PUBLIC_APP_URL: z.string().url(),
});

const optionalSecret = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().min(1).optional(),
);

const serverEnvSchema = z.object({
  SUPABASE_SECRET_KEY: optionalSecret,
  FIRECRAWL_API_KEY: optionalSecret,
  VAPI_PRIVATE_KEY: optionalSecret,
  NEXT_PUBLIC_VAPI_PUBLIC_KEY: optionalSecret,
  VAPI_PHONE_NUMBER_ID: optionalSecret,
  VAPI_ASSISTANT_ID: optionalSecret,
  VAPI_WEBHOOK_CREDENTIAL_ID: optionalSecret,
  VOICE_WEBHOOK_SECRET: optionalSecret,
  JOBS_SECRET: optionalSecret,
  DISCOVERY_MODE: z.preprocess((value) => value || undefined, modeSchema),
  VOICE_MODE: z.preprocess((value) => value || undefined, modeSchema),
});

export type PublicEnv = z.infer<typeof publicEnvSchema>;
export type ServerEnv = z.infer<typeof serverEnvSchema>;

export function getPublicEnv(): PublicEnv {
  return parsePublicEnv(process.env);
}

export function getServerEnv(): ServerEnv {
  return parseServerEnv(process.env);
}

export function parsePublicEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): PublicEnv {
  return publicEnvSchema.parse(input);
}

export function parseServerEnv(input: NodeJS.ProcessEnv | Record<string, string | undefined>): ServerEnv {
  return serverEnvSchema.parse(input);
}
