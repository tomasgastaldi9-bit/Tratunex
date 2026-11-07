"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { UpsertContactInputSchema, type SupplierDTO } from "@/contracts/crm";
import { useSupplierMutation } from "./supplier-mutation";

export function SupplierEditor({ companyId, supplier }: { companyId: string; supplier?: SupplierDTO }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(supplier?.name ?? "");
  const [organization, setOrganization] = useState(supplier?.organization ?? "");
  const [phone, setPhone] = useState(supplier?.phone_e164 ?? "");
  const [website, setWebsite] = useState(supplier?.website ?? "");
  const [sourceKind, setSourceKind] = useState<"manual" | "csv" | "firecrawl">(supplier?.source.kind ?? "manual");
  const [sourceLabel, setSourceLabel] = useState(supplier?.source.label ?? "Alta manual desde Proveedores");
  const [sourceUrl, setSourceUrl] = useState(supplier?.source.url ?? "");
  const [doNotContact, setDoNotContact] = useState(supplier?.do_not_contact ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const mutation = useSupplierMutation(`${companyId}:supplier:${supplier?.id ?? "new"}`, companyId, supplier?.id);

  function toggle() {
    if (mutation.locked) return;
    if (!open) {
      setName(supplier?.name ?? ""); setOrganization(supplier?.organization ?? "");
      setPhone(supplier?.phone_e164 ?? ""); setWebsite(supplier?.website ?? "");
      setSourceKind(supplier?.source.kind ?? "manual"); setSourceLabel(supplier?.source.label ?? "Alta manual desde Proveedores");
      setSourceUrl(supplier?.source.url ?? ""); setDoNotContact(supplier?.do_not_contact ?? false); setErrors({});
    }
    setOpen(!open);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (mutation.uncertain) return;
    const input = UpsertContactInputSchema.safeParse({ name, organization: organization.trim() || null,
      phone_e164: phone.trim(), website: website.trim() || null,
      source: { kind: sourceKind, label: sourceLabel, url: sourceUrl.trim() || null }, do_not_contact: doNotContact });
    if (!input.success) {
      setErrors(Object.fromEntries(input.error.issues.map(issue => [issue.path.join("_"),
        issue.path[0] === "phone_e164" ? "Escribí el teléfono con + y código de país, sin espacios ni guiones."
          : issue.path[0] === "website" || issue.path.join("_") === "source_url" ? "Usá una dirección completa con https:// o http://." : "Completá este dato."])));
      return;
    }
    setErrors({});
    const result = await mutation.submit(supplier ? `/api/crm/suppliers/${supplier.id}` : "/api/crm/suppliers", supplier ? "PATCH" : "POST",
      input.data, supplier ? "Guardamos los datos del proveedor." : "Agregamos el proveedor.");
    if (result) { setOpen(false); router.push(`/suppliers/${result.supplier.id}`); }
  }

  async function retry() {
    const result = await mutation.retry();
    if (result) { setOpen(false); router.push(`/suppliers/${result.supplier.id}`); }
  }

  return <div className="space-y-4">
    <Button icon={supplier ? Pencil : Plus} variant={supplier ? "secondary" : "primary"} onClick={toggle}
      disabled={mutation.locked} aria-expanded={open}>{supplier ? "Editar proveedor" : "Agregar proveedor"}</Button>
    {open && <Card className="space-y-5 border border-line bg-canvas" aria-label={supplier ? "Editar proveedor" : "Agregar proveedor"}>
      <h2 className="text-lg font-bold">{supplier ? "Datos del proveedor" : "Nuevo proveedor"}</h2>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Input name="name" label="Nombre del proveedor" value={name} required disabled={mutation.locked} error={errors.name}
            autoComplete="name" onChange={event => setName(event.target.value)} />
          <Input name="organization" label="Empresa u organización" value={organization} disabled={mutation.locked}
            autoComplete="organization" onChange={event => setOrganization(event.target.value)} />
          <Input name="phone_e164" label="Teléfono con código de país" type="tel" value={phone} required disabled={mutation.locked}
            error={errors.phone_e164} autoComplete="tel" onChange={event => setPhone(event.target.value)}
            hint="Formato internacional: +, código de país y número, sin espacios ni guiones." />
          <Input name="website" label="Sitio web" type="url" value={website} disabled={mutation.locked} error={errors.website}
            autoComplete="url" placeholder="https://proveedor.com" onChange={event => setWebsite(event.target.value)} />
          <Select label="Origen del proveedor" name="source_kind" value={sourceKind} disabled={mutation.locked}
            onChange={event => setSourceKind(event.target.value as typeof sourceKind)} options={[
              { value: "manual", label: "Carga manual" }, { value: "csv", label: "Archivo CSV" }, { value: "firecrawl", label: "Búsqueda web" },
            ]} />
          <Input name="source_label" label="Detalle de la fuente" value={sourceLabel} required disabled={mutation.locked}
            error={errors.source_label} onChange={event => setSourceLabel(event.target.value)} />
          <Input name="source_url" label="URL de la fuente" type="url" value={sourceUrl} disabled={mutation.locked}
            error={errors.source_url} placeholder="https://fuente.com" onChange={event => setSourceUrl(event.target.value)} />
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input name="do_not_contact" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink" checked={doNotContact}
            disabled={mutation.locked || supplier?.do_not_contact} onChange={event => setDoNotContact(event.target.checked)} />
          <span>No contactar por teléfono{supplier?.do_not_contact && <span className="mt-1 block text-xs text-ink-muted">
            Esta preferencia se conserva al editar o reimportar el proveedor.</span>}</span>
        </label>
        {!supplier && <p className="text-sm text-ink-muted">Después de guardar podés cargar la billetera de cobro desde la ficha.</p>}
        {mutation.error && <Alert tone={mutation.uncertain ? "warning" : "danger"} title={mutation.uncertain ? "Guardado pendiente de confirmar" : "Revisá el proveedor"}>{mutation.error}</Alert>}
        <div className="flex flex-wrap gap-2.5">
          {mutation.uncertain ? <Button loading={mutation.pending} onClick={() => void retry()}>Confirmar guardado</Button>
            : <Button type="submit" loading={mutation.pending}>Guardar proveedor</Button>}
          <Button variant="ghost" disabled={mutation.locked} onClick={toggle}>Cerrar formulario</Button>
          {mutation.error && !mutation.uncertain && supplier && <Button variant="ghost" onClick={() => { setOpen(false); router.refresh(); }}>Actualizar ficha</Button>}
        </div>
      </form>
    </Card>}
  </div>;
}
