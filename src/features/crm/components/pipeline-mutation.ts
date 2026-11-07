"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearContactAction, contactActionId } from "./contact-action-client";
import { pipelineActionMessage, savePipelineAction, type SavedDeal } from "./pipeline-action-client";

export function usePipelineMutation(scope: string, companyId: string, dealId?: string) {
  const router = useRouter();
  const busy = useRef(false);
  const intent = useRef<{ serialized: string; id: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(url: string, input: { contact_id?: string; deal_id?: string; stage?: string }, message: string): Promise<SavedDeal | null> {
    if (busy.current) return null;
    const serialized = JSON.stringify(input);
    if (uncertain && intent.current?.serialized !== serialized) return null;
    busy.current = true; setPending(true); setError(null); setSuccess(null);
    try {
      if (intent.current?.serialized !== serialized) intent.current = { serialized, id: await contactActionId(scope, input) };
      const result = await savePipelineAction(url, intent.current.id, input, companyId, dealId);
      if (!result.ok) {
        setUncertain(["PROVIDER_ERROR", "PROVIDER_UNAVAILABLE"].includes(result.error.code));
        setError(pipelineActionMessage(result.error.code));
        return null;
      }
      clearContactAction(scope); intent.current = null; setUncertain(false); setSuccess(message);
      router.refresh();
      return result.data;
    } catch {
      setUncertain(true);
      setError("No pudimos confirmar el guardado. Conservamos esta acción: reintentá con los mismos datos para recuperar el resultado sin duplicarlo.");
      return null;
    } finally { busy.current = false; setPending(false); }
  }

  return { submit, pending, uncertain, error, success, locked: pending || uncertain };
}
