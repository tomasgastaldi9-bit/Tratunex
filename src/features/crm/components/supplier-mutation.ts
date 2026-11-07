"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { clearContactAction, contactActionId } from "./contact-action-client";
import { saveSupplierAction, supplierActionMessage, type SavedSupplier } from "./supplier-action-client";

export function useSupplierMutation(scope: string, companyId: string, supplierId?: string, kind: "supplier" | "wallet" = "supplier") {
  const router = useRouter();
  const busy = useRef(false);
  const intent = useRef<{ url: string; method: "POST" | "PATCH"; input: unknown; serialized: string; id: string; message: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function submit(url: string, method: "POST" | "PATCH", input: unknown, message: string): Promise<SavedSupplier | null> {
    if (busy.current) return null;
    const serialized = JSON.stringify({ url, method, input });
    if (uncertain && intent.current?.serialized !== serialized) return null;
    busy.current = true; setPending(true); setError(null); setSuccess(null);
    try {
      if (intent.current?.serialized !== serialized) {
        intent.current = { url, method, input, message, serialized, id: await contactActionId(scope, { url, method, input }) };
      }
      const result = await saveSupplierAction(url, method, intent.current.id, input, companyId, supplierId);
      if (!result.ok) {
        setUncertain(["PROVIDER_ERROR", "PROVIDER_UNAVAILABLE"].includes(result.error.code));
        setError(supplierActionMessage(result.error.code, kind));
        return null;
      }
      clearContactAction(scope); intent.current = null; setUncertain(false); setSuccess(message);
      router.refresh();
      return result.data;
    } catch {
      setUncertain(true);
      setError("No pudimos confirmar el guardado. Conservamos esta acción y sus datos: volvé a enviarla para recuperar el resultado.");
      return null;
    } finally { busy.current = false; setPending(false); }
  }

  async function retry() {
    const previous = intent.current;
    return previous ? submit(previous.url, previous.method, previous.input, previous.message) : null;
  }

  return { submit, retry, pending, uncertain, error, success, locked: pending || uncertain };
}
