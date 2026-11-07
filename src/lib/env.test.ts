import { describe, expect, it } from "vitest";
import { parsePublicEnv, parseServerEnv } from "./env";

describe("public environment", () => {
  it("requires valid Supabase and application URLs and a publishable key", () => {
    expect(() => parsePublicEnv({})).toThrow();
    expect(() =>
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "not-a-url",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        NEXT_PUBLIC_APP_URL: "https://app.tratunex.test",
      }),
    ).toThrow();
  });

  it("returns only public values and never copies server secrets", () => {
    expect(
      parsePublicEnv({
        NEXT_PUBLIC_SUPABASE_URL: "https://db.tratunex.test",
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
        NEXT_PUBLIC_APP_URL: "https://app.tratunex.test",
        SUPABASE_SECRET_KEY: "sb_secret_do_not_expose",
        VAPI_PRIVATE_KEY: "vapi_private_do_not_expose",
      }),
    ).toStrictEqual({
      NEXT_PUBLIC_SUPABASE_URL: "https://db.tratunex.test",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
      NEXT_PUBLIC_APP_URL: "https://app.tratunex.test",
    });
  });
});

describe("server environment", () => {
  it("treats empty optional provider credentials as absent and defaults modes to mock", () => {
    expect(
      parseServerEnv({
        SUPABASE_SECRET_KEY: "",
        FIRECRAWL_API_KEY: "",
        VAPI_PRIVATE_KEY: "",
        VOICE_WEBHOOK_SECRET: "",
        JOBS_SECRET: "",
        DISCOVERY_MODE: "",
        VOICE_MODE: "",
      }),
    ).toMatchObject({
      SUPABASE_SECRET_KEY: undefined,
      FIRECRAWL_API_KEY: undefined,
      VAPI_PRIVATE_KEY: undefined,
      VOICE_WEBHOOK_SECRET: undefined,
      JOBS_SECRET: undefined,
      DISCOVERY_MODE: "mock",
      VOICE_MODE: "mock",
    });
  });

  it("rejects unsupported integration modes", () => {
    expect(() => parseServerEnv({ DISCOVERY_MODE: "testnet" })).toThrow();
    expect(() => parseServerEnv({ VOICE_MODE: "browser" })).toThrow();
  });
});
