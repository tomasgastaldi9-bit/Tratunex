"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { UpsertContactInputSchema, type ContactDTO } from "@/contracts/crm";
import { clearContactAction, contactActionId, contactActionMessage, saveContactAction } from "./contact-action-client";

export function ContactEditor({ companyId, contact }: { companyId: string; contact?: ContactDTO }) {
  const router = useRouter();
  const busy = useRef(false);
  const intent = useRef<{ serialized: string; id: string } | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState(contact?.name ?? "");
  const [organization, setOrganization] = useState(contact?.organization ?? "");
  const [phone, setPhone] = useState(contact?.phone_e164 ?? "");
  const [website, setWebsite] = useState(contact?.website ?? "");
  const [doNotContact, setDoNotContact] = useState(contact?.do_not_contact ?? false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const locked = pending || uncertain;
  const scope = `${companyId}:${contact?.id ?? "new"}`;

  function toggle() {
    if (locked) return;
    if (!open) {
      setName(contact?.name ?? ""); setOrganization(contact?.organization ?? "");
      setPhone(contact?.phone_e164 ?? ""); setWebsite(contact?.website ?? "");
      setDoNotContact(contact?.do_not_contact ?? false); setErrors({}); setMessage(null);
    }
    setOpen(!open);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    if (busy.current) return;
    const parsed = UpsertContactInputSchema.safeParse({ name, organization: organization.trim() || null,
      phone_e164: phone.trim(), website: website.trim() || null,
      source: contact?.source ?? { kind: "manual", label: "Alta manual desde CRM", url: null },
      do_not_contact: doNotContact });
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map(issue => [String(issue.path[0]),
        issue.path[0] === "phone_e164" ? "Escribí el teléfono con + y código de país, sin espacios ni guiones."
          : issue.path[0] === "website" ? "Usá una dirección completa con https:// o http://." : "Completá este dato."])));
      return;
    }
    const serialized = JSON.stringify(parsed.data);
    if (uncertain && intent.current?.serialized !== serialized) return;
    busy.current = true; setPending(true); setErrors({}); setMessage(null);
    try {
      if (intent.current?.serialized !== serialized) intent.current = { serialized, id: await contactActionId(scope, parsed.data) };
      const result = await saveContactAction(contact ? `/api/crm/contacts/${contact.id}` : "/api/crm/contacts",
        contact ? "PATCH" : "POST", intent.current.id, parsed.data, companyId);
      if (!result.ok) {
        setUncertain(["PROVIDER_UNAVAILABLE", "PROVIDER_ERROR"].includes(result.error.code));
        setMessage(contactActionMessage(result.error.code));
        return;
      }
      clearContactAction(scope); intent.current = null; setUncertain(false); setOpen(false);
      router.push(`/contacts/${result.data.contact.id}`);
      router.refresh();
    } catch {
      setUncertain(true);
      setMessage("No pudimos confirmar el guardado. Conservamos esta acción: reintentá con los mismos datos para recuperar el resultado sin duplicarlo.");
    } finally { busy.current = false; setPending(false); }
  }

  return <div className="space-y-5">
    <Button icon={contact ? Pencil : Plus} variant={contact ? "secondary" : "primary"}
      onClick={toggle} disabled={locked} aria-expanded={open}>{contact ? "Editar contacto" : "Agregar contacto"}</Button>
    {open && <Card className="border border-line bg-canvas" aria-label={contact ? "Editar contacto" : "Agregar contacto"}>
      <h2 className="mb-5 text-lg font-bold">{contact ? "Datos del contacto" : "Nuevo contacto"}</h2>
      <form onSubmit={save} className="space-y-5">
        <div className="grid gap-5 lg:grid-cols-2">
          <Input name="name" label="Nombre del contacto" value={name} required disabled={locked} error={errors.name}
            autoComplete="name" onChange={event => setName(event.target.value)} />
          <Input name="organization" label="Empresa u organización" value={organization} disabled={locked}
            autoComplete="organization" onChange={event => setOrganization(event.target.value)} />
          <Input name="phone_e164" label="Teléfono con código de país" type="tel" value={phone} required disabled={locked}
            error={errors.phone_e164} autoComplete="tel" onChange={event => setPhone(event.target.value)}
            hint="Formato internacional: +, código de país y número, sin espacios ni guiones." />
          <Input name="website" label="Sitio web" type="url" value={website} disabled={locked} error={errors.website}
            placeholder="https://empresa.com" autoComplete="url" onChange={event => setWebsite(event.target.value)} />
        </div>
        <label className="flex items-start gap-2.5 text-sm">
          <input name="do_not_contact" type="checkbox" className="mt-0.5 size-4 shrink-0 accent-ink" checked={doNotContact}
            disabled={locked || contact?.do_not_contact} onChange={event => setDoNotContact(event.target.checked)} />
          <span>No contactar por teléfono{contact?.do_not_contact && <span className="mt-1 block text-xs text-ink-muted">
            Este pedido se conserva al editar o reimportar el contacto.</span>}</span>
        </label>
        {message && <Alert tone={uncertain ? "warning" : "danger"} title={uncertain ? "Guardado pendiente de confirmar" : "Revisá el contacto"}>{message}</Alert>}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" loading={pending}>{uncertain ? "Confirmar guardado" : "Guardar contacto"}</Button>
          <Button variant="ghost" disabled={locked} onClick={toggle}>Cerrar formulario</Button>
        </div>
      </form>
    </Card>}
  </div>;
}
