import { createRoot } from "react-dom/client";
import { useState } from "react";
import { DemoPaymentActions } from "../../src/features/crm/components/demo-payment-actions";
import { PurchaseOrderSchema } from "../../src/contracts/purchase-orders";

const order = PurchaseOrderSchema.parse({ id: "80000000-0000-4000-8000-000000000001", company_id: "10000000-0000-4000-8000-000000000001",
  purchase_request_id: "50000000-0000-4000-8000-000000000001", supplier_quote_id: "60000000-0000-4000-8000-000000000001", supplier_contact_id: "20000000-0000-4000-8000-000000000001",
  product: "Producto ficticio", quantity: 1, unit: "unidad", supplier_name: "Proveedor de prueba", quote_source: "example", quoted_unit_price: "1", quoted_total: "1", quoted_currency: "ARS",
  amount_atomic: "1000000000000000000", pricing_status: "ready", status: "awaiting_approval", version: 1, wallet: { chain: "arbitrum", address: "0x4E5F932Fa2D1BE48A4FC39a80CD2eC85C8AA5bB1" },
  wallet_version: 1, approved_by: null, approved_at: null, created_at: "2026-11-07T15:00:00Z", updated_at: "2026-11-07T15:00:00Z" });
const prior = new URLSearchParams(location.search).has("stale") ? { id: "90000000-0000-4000-8000-000000000001", status: "reserved" as const,
  tx_hash: null, explorer_url: null, amount_atomic: "1000000000000000000", token: "ARGt" as const, chain: "arbitrum" as const } : null;
function Harness() {
  const [payment, setPayment] = useState<Parameters<typeof DemoPaymentActions>[0]["payment"]>(prior);
  return <><DemoPaymentActions order={order} payment={payment} enabled />
    <button onClick={() => setPayment({ id: "90000000-0000-4000-8000-000000000001", status: "unknown", tx_hash: null, explorer_url: null,
      amount_atomic: "1000000000000000000", token: "ARGt", chain: "arbitrum" })}>Simular estado del servidor</button></>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
