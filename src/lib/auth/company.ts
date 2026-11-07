import { cookies } from "next/headers";
import { z } from "zod";
import type { Ctx, Result } from "@/contracts/common";
import { createRequestSupabaseClient } from "../supabase/request";

export const selectedCompanyCookie = "tratunex_company";

export function isAuthUnavailable(error: { name?: string; status?: number }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === undefined || error.status === 0 || error.status >= 500;
}

export async function getCompanyContext(companyId?: string, options?: { readOnlyCookies?: boolean }): Promise<Result<Ctx>> {
  const selected = companyId ?? (await cookies()).get(selectedCompanyCookie)?.value;
  if (!z.uuid().safeParse(selected).success) {
    return { ok: false, error: { code: "VALIDATION_ERROR", message: "Seleccioná una empresa válida", retryable: false } };
  }

  try {
    const supabase = await createRequestSupabaseClient(options);
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError && isAuthUnavailable(authError)) {
      return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "El servicio de acceso no está disponible", retryable: true } };
    }
    if (authError || !user) {
      return { ok: false, error: { code: "FORBIDDEN", message: "Iniciá sesión", retryable: false } };
    }

    const { data, error } = await supabase.from("company_members")
      .select("company_id")
      .eq("company_id", selected!)
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) {
      return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo comprobar el acceso", retryable: true } };
    }
    if (!data) {
      return { ok: false, error: { code: "FORBIDDEN", message: "No tenés acceso a esta empresa", retryable: false } };
    }
    return { ok: true, data: { company_id: data.company_id, actor_type: "user", actor_id: user.id } };
  } catch {
    return { ok: false, error: { code: "PROVIDER_UNAVAILABLE", message: "No se pudo comprobar el acceso", retryable: true } };
  }
}
