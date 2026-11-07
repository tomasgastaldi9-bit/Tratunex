import { afterEach, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

vi.mock("next/server", () => ({
  NextResponse: {
    next: () => ({ cookies: { set: vi.fn() }, headers: new Headers() }),
  },
}));
vi.mock("@supabase/ssr", () => ({
  createServerClient: (_url: string, _key: string, options: {
    cookies: { setAll: (cookies: { name: string; value: string; options: object }[], headers: Record<string, string>) => void },
  }) => ({
    auth: {
      getClaims: async () => {
        options.cookies.setAll([{ name: "session", value: "refreshed", options: {} }], { "Cache-Control": "private, no-store" });
        options.cookies.setAll([{ name: "other", value: "value", options: {} }], {});
      },
    },
  }),
}));

import { proxy } from "./proxy";

afterEach(() => vi.unstubAllEnvs());

it("retains private cache headers and refreshed cookies across cookie writes", async () => {
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://db.example.test");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "publishable-test");
  const request = { cookies: { getAll: () => [], set: vi.fn() } } as unknown as NextRequest;
  const response = await proxy(request);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(response.cookies.set).toHaveBeenCalledTimes(2);
});
