import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCompanyContext } from "./company";
import { createRequestSupabaseClient } from "../supabase/request";

vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../supabase/request", () => ({ createRequestSupabaseClient: vi.fn() }));

const company = "11111111-1111-4111-8111-111111111111";
const userId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const getUser = vi.fn();
const maybeSingle = vi.fn();
const eq = vi.fn();
const select = vi.fn();
const from = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  eq.mockReturnValue({ eq, maybeSingle });
  select.mockReturnValue({ eq });
  from.mockReturnValue({ select });
  vi.mocked(createRequestSupabaseClient).mockResolvedValue({ auth: { getUser }, from } as never);
});

describe("server company context", () => {
  it("constructs identity from the verified user and matching membership", async () => {
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    maybeSingle.mockResolvedValue({ data: { company_id: company }, error: null });
    expect(await getCompanyContext(company)).toEqual({ ok: true, data: { company_id: company, actor_type: "user", actor_id: userId } });
    expect(eq).toHaveBeenCalledWith("user_id", userId);
    expect(eq).toHaveBeenCalledWith("company_id", company);
  });

  it("rejects a company ID when the verified user has no membership", async () => {
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getCompanyContext(company)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
  });

  it("rejects an invalid or unauthenticated request", async () => {
    expect(await getCompanyContext("not-a-uuid")).toMatchObject({ ok: false, error: { code: "VALIDATION_ERROR" } });
    getUser.mockResolvedValue({ data: { user: null }, error: null });
    expect(await getCompanyContext(company)).toMatchObject({ ok: false, error: { code: "FORBIDDEN" } });
    expect(from).not.toHaveBeenCalled();
  });

  it("does not mistake a database error for permission", async () => {
    getUser.mockResolvedValue({ data: { user: { id: userId } }, error: null });
    maybeSingle.mockResolvedValue({ data: null, error: { message: "unavailable" } });
    expect(await getCompanyContext(company)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE" } });
  });

  it("reports an Auth outage as a retryable provider error", async () => {
    getUser.mockResolvedValue({ data: { user: null }, error: { name: "AuthRetryableFetchError", status: 503 } });
    expect(await getCompanyContext(company)).toMatchObject({ ok: false, error: { code: "PROVIDER_UNAVAILABLE", retryable: true } });
  });
});
