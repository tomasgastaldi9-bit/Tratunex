import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Ctx, Result } from "@/contracts/common";
import { getCompanyContext } from "@/features/platform/server/public";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import { crmFailure } from "./persistent-crm";
import { authorizeCrmClient } from "./authorization";

export async function getAuthorizedCrmClient(ctx: Ctx, options: { readOnlyCookies?: boolean } = {}): Promise<Result<SupabaseClient>> {
  return authorizeCrmClient(ctx, {
    verifyUser: companyId => getCompanyContext(companyId, options),
    createUserClient: () => createRequestSupabaseClient(options),
    createServiceClient: async () => {
      // Only verified server modules receive this client. No browser route accepts
      // actor_type, actor_id or company_id from its request body.
      const secret = getServerEnv().SUPABASE_SECRET_KEY;
      if (!secret) return crmFailure("PROVIDER_UNAVAILABLE", "La conexión de servidor del CRM no está configurada.", true);
      const client = createClient(getPublicEnv().NEXT_PUBLIC_SUPABASE_URL, secret, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      return { ok: true, data: client };
    },
  });
}
