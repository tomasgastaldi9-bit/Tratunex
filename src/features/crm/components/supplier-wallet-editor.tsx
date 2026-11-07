"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Wallet } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { SetSupplierWalletInputSchema, type SupplierDTO } from "@/contracts/crm";
import { useSupplierMutation } from "./supplier-mutation";

const WalletPayloadSchema = SetSupplierWalletInputSchema.omit({ contact_id: true });

export function SupplierWalletEditor({ supplier }: { supplier: SupplierDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [chain, setChain] = useState<string>(supplier.collection_wallet?.chain ?? "");
  const [address, setAddress] = useState(supplier.collection_wallet?.address ?? "");
  const [validation, setValidation] = useState<string | null>(null);
  const [operation, setOperation] = useState<"save" | "clear">("save");
  const mutation = useSupplierMutation(`${supplier.company_id}:supplier-wallet:${supplier.id}`, supplier.company_id, supplier.id, "wallet");
  const url = `/api/crm/suppliers/${supplier.id}/wallet`;

  function toggle() {
    if (mutation.locked) return;
    if (!open) {
      setChain(supplier.collection_wallet?.chain ?? ""); setAddress(supplier.collection_wallet?.address ?? ""); setValidation(null);
    }
    setOpen(!open);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (mutation.uncertain) return;
    const parsed = WalletPayloadSchema.safeParse({ collection_wallet: { chain, address: address.trim() }, expected_wallet_version: supplier.wallet_version });
    if (!parsed.success) {
      setValidation("Elegí la red y escribí una dirección completa: 0x seguido de 40 caracteres hexadecimales. La dirección de ceros no es válida.");
      return;
    }
    setOperation("save"); setValidation(null);
    const result = await mutation.submit(url, "POST", parsed.data, "Guardamos la billetera de cobro del proveedor.");
    if (result) setOpen(false);
  }

  async function clear() {
    if (mutation.locked) return;
    setOperation("clear"); setValidation(null);
    const result = await mutation.submit(url, "POST", { collection_wallet: null, expected_wallet_version: supplier.wallet_version },
      "Quitamos la billetera registrada. El proveedor quedó con billetera pendiente.");
    if (result) setOpen(false);
  }

  async function retry() {
    const result = await mutation.retry();
    if (result) setOpen(false);
  }

  return <div className="space-y-4">
    <Button variant="secondary" icon={Wallet} onClick={toggle} disabled={mutation.locked} aria-expanded={open}>
      {supplier.collection_wallet ? "Editar billetera de cobro" : "Configurar billetera de cobro"}</Button>
    {!open && mutation.success && <Alert tone="success">{mutation.success}</Alert>}
    {open && <Card className="space-y-5 border border-line bg-canvas" aria-label="Billetera de cobro del proveedor">
      <h3 className="text-lg font-bold">Datos de cobro declarados</h3>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Select label="Red de la billetera" value={chain} required disabled={mutation.locked} placeholder="Elegí la red"
            onChange={event => setChain(event.target.value)} options={[{ value: "base", label: "Base" }, { value: "arbitrum", label: "Arbitrum" }]} />
          <Input label="Dirección pública de cobro" value={address} required disabled={mutation.locked} spellCheck={false} autoComplete="off"
            placeholder="0x…" onChange={event => setAddress(event.target.value)} hint="Dirección completa indicada por el proveedor para la red elegida." />
        </div>
        <p className="text-sm text-ink-muted">Cargá la red y la dirección que el proveedor indicó para recibir sus cobros.</p>
        {validation && <Alert tone="danger">{validation}</Alert>}
        {mutation.error && <Alert tone={mutation.uncertain ? "warning" : "danger"}
          title={mutation.uncertain ? operation === "clear" ? "Eliminación pendiente de confirmar" : "Guardado pendiente de confirmar" : "Revisá la billetera"}>{mutation.error}</Alert>}
        <div className="flex flex-wrap gap-2.5">
          {mutation.uncertain ? <Button loading={mutation.pending} onClick={() => void retry()}>{operation === "clear" ? "Confirmar eliminación" : "Confirmar guardado"}</Button>
            : <Button type="submit" loading={mutation.pending && operation === "save"} disabled={mutation.pending && operation !== "save"}>Guardar billetera</Button>}
          {supplier.collection_wallet && <Button variant="ghost" disabled={mutation.uncertain || (mutation.pending && operation !== "clear")} loading={mutation.pending && operation === "clear"}
            onClick={() => void clear()}>Quitar billetera registrada</Button>}
          <Button variant="ghost" disabled={mutation.locked} onClick={toggle}>Cerrar formulario de billetera</Button>
          {mutation.error && !mutation.uncertain && <Button variant="ghost" onClick={() => { setOpen(false); router.refresh(); }}>Actualizar ficha</Button>}
        </div>
      </form>
    </Card>}
  </div>;
}
