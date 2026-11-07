import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createBrowserSupabaseClient } from "./browser";
import { createServerSupabaseClient } from "./server";

const publicEnv = {
  NEXT_PUBLIC_SUPABASE_URL: "https://db.tratunex.test",
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
  NEXT_PUBLIC_APP_URL: "https://app.tratunex.test",
};

function getClientConfig(client: SupabaseClient) {
  return client as unknown as { supabaseUrl: string; supabaseKey: string };
}

describe("Supabase client factories", () => {
  it("creates a browser client from public configuration only", () => {
    const client = createBrowserSupabaseClient(publicEnv);

    const config = getClientConfig(client);
    expect(config.supabaseUrl).toBe(publicEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(config.supabaseKey).toBe(publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(config.supabaseKey).not.toContain("secret");
  });

  it("creates a server client with request-scoped cookie methods", () => {
    const cookieStore = {
      getAll: () => [],
      setAll: () => undefined,
    };
    const client = createServerSupabaseClient(cookieStore, {
      ...publicEnv,
      SUPABASE_SECRET_KEY: "sb_secret_server_only",
    });

    const config = getClientConfig(client);
    expect(config.supabaseUrl).toBe(publicEnv.NEXT_PUBLIC_SUPABASE_URL);
    expect(config.supabaseKey).toBe(publicEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
    expect(config.supabaseKey).not.toContain("secret");
  });
});
