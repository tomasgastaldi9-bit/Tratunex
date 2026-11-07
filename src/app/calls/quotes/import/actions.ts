"use server";

import { redirect } from "next/navigation";
import { getCompanyContext } from "@/features/platform/server/public";
import { importQuoteFromCall } from "@/features/voice/server/public";
import { importQuoteActionId } from "@/features/voice/server/quote-import";

// Trae la cotización de una llamada de Vapi (QUO-02). La empresa sale de la
// sesión; en la URL de vuelta solo viaja un código de error, nunca un texto.
export async function importQuoteAction(formData: FormData) {
  const input = {
    provider_call_id: String(formData.get("provider_call_id") ?? "").trim(),
    supplier_contact_id: String(formData.get("supplier_contact_id") ?? ""),
    purchase_request_id: String(formData.get("purchase_request_id") ?? "").trim(),
  };
  const page = (extra: Record<string, string>) =>
    `/calls/quotes/import?${new URLSearchParams({ purchase_request_id: input.purchase_request_id, ...extra })}`;

  const context = await getCompanyContext();
  if (!context.ok) redirect(page({ error: "FORBIDDEN" }));

  const result = await importQuoteFromCall({ ...context.data, action_id: importQuoteActionId(input.provider_call_id) }, input);
  if (!result.ok) {
    const code = result.error.code === "CONFLICT" && result.error.retryable ? "CONFLICT_RETRY" : result.error.code;
    redirect(page({ error: code }));
  }
  redirect(page({ imported: result.data.created ? "new" : "existing" }));
}
