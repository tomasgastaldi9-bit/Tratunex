"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { Alert } from "../../../components/ui/Alert";
import { Button } from "../../../components/ui/Button";
import { resultSchema } from "../../../contracts/common";
import { CreatePurchaseOrderDataSchema, CreatePurchaseOrderInputSchema } from "../../../contracts/purchase-orders";
import { clearContactAction, contactActionId } from "./contact-action-client";

export async function createOrderFromQuote(companyId: string, supplierQuoteId: string, action_id: string) {
  const input = CreatePurchaseOrderInputSchema.parse({ supplier_quote_id: supplierQuoteId });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch("/api/crm/orders", { method: "POST", credentials: "same-origin", signal: controller.signal,
      headers: { "Content-Type": "application/json", "Idempotency-Key": action_id }, body: JSON.stringify({ action_id, input }) });
    const result = resultSchema(CreatePurchaseOrderDataSchema).safeParse(await response.json());
    if (!result.success || (result.data.ok && (!response.ok || result.data.data.order.company_id !== companyId
      || result.data.data.order.supplier_quote_id !== supplierQuoteId))) {
      throw new Error("El servidor no confirmó una orden para esta empresa y cotización.");
    }
    return result.data;
  } finally { clearTimeout(timeout); }
}

export function CreatePurchaseOrderButton({ companyId, supplierQuoteId }: { companyId: string; supplierQuoteId: string }) {
  const router = useRouter();
  const busy = useRef(false);
  const intent = useRef<{ companyId: string; supplierQuoteId: string; action_id: string } | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (busy.current) return;
    if (!CreatePurchaseOrderInputSchema.safeParse({ supplier_quote_id: supplierQuoteId }).success) {
      setError("La cotización no está disponible. Volvé a cargar la comparación.");
      return;
    }
    busy.current = true; setPending(true); setError(null);
    let sent = false;
    try {
      if (!intent.current || (!uncertain && (intent.current.companyId !== companyId || intent.current.supplierQuoteId !== supplierQuoteId))) {
        intent.current = { companyId, supplierQuoteId, action_id: await contactActionId(`${companyId}:order-create:${supplierQuoteId}`,
          { supplier_quote_id: supplierQuoteId }) };
      }
      const requested = intent.current;
      sent = true;
      const result = await createOrderFromQuote(requested.companyId, requested.supplierQuoteId, requested.action_id);
      if (!result.ok) {
        setUncertain(["PROVIDER_ERROR", "PROVIDER_UNAVAILABLE"].includes(result.error.code));
        setError(result.error.message);
        return;
      }
      clearContactAction(`${requested.companyId}:order-create:${requested.supplierQuoteId}`);
      intent.current = null; setUncertain(false);
      router.push(`/orders/${result.data.order.id}`);
    } catch {
      setUncertain(sent);
      setError(sent ? "No pudimos confirmar la creación. Conservamos esta acción: confirmala para recuperar la misma orden sin duplicarla."
        : "No se pudo preparar la creación de la orden. Volvé a intentar.");
    } finally { busy.current = false; setPending(false); }
  }

  return <div className="space-y-3">
    <Button icon={FilePlus2} loading={pending} onClick={() => void create()}>{uncertain ? "Confirmar creación de orden" : "Crear orden de compra"}</Button>
    {error && <Alert tone={uncertain ? "warning" : "danger"} title={uncertain ? "Creación pendiente de confirmar" : "Revisá la cotización"}>{error}</Alert>}
  </div>;
}
