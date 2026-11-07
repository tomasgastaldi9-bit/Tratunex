import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, type PublicEnv, type ServerEnv } from "../env";

export type CookieStore = {
  getAll: () => Array<{ name: string; value: string }>;
  setAll: (cookies: Array<{ name: string; value: string; options: CookieOptions }>) => void;
};

export function createServerSupabaseClient(
  cookieStore: CookieStore,
  env: PublicEnv & Partial<ServerEnv> = getPublicEnv(),
): SupabaseClient {
  return createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookies) => cookieStore.setAll(cookies),
      },
    },
  );
}
