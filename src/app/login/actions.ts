"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getCompanyContext } from "@/features/platform/server/public";
import { isAuthUnavailable, selectedCompanyCookie } from "@/lib/auth/company";
import { createRequestSupabaseClient } from "@/lib/supabase/request";

export async function signIn(formData: FormData) {
  const input = z.object({ email: z.email(), password: z.string().min(1) }).safeParse({
    email: formData.get("email"), password: formData.get("password"),
  });
  if (!input.success) redirect("/login?error=invalid");
  let failure: "invalid" | "unavailable" | null = null;
  try {
    const client = await createRequestSupabaseClient();
    const { error } = await client.auth.signInWithPassword(input.data);
    if (error) failure = isAuthUnavailable(error) ? "unavailable" : "invalid";
  } catch {
    failure = "unavailable";
  }
  if (failure) redirect(`/login?error=${failure}`);
  (await cookies()).delete(selectedCompanyCookie);
  redirect("/login/companies");
}

export async function selectCompany(formData: FormData) {
  const companyId = formData.get("company_id");
  if (typeof companyId !== "string") redirect("/login/companies?error=access");
  const context = await getCompanyContext(companyId);
  if (!context.ok) redirect(`/login/companies?error=${context.error.code === "PROVIDER_UNAVAILABLE" ? "unavailable" : "access"}`);
  (await cookies()).set(selectedCompanyCookie, context.data.company_id, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/",
  });
  redirect("/login/companies?selected=1");
}

export async function signOut() {
  const client = await createRequestSupabaseClient();
  const { error } = await client.auth.signOut();
  if (error) redirect("/login/companies?error=signout");
  (await cookies()).delete(selectedCompanyCookie);
  redirect("/login");
}
