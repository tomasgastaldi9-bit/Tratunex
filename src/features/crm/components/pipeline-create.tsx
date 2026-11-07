"use client";

import { useRef, useState, type FormEvent } from "react";
import { Plus, Search } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { CreateDealInputSchema, type ContactDTO } from "@/contracts/crm";
import { pipelineActionMessage, readPipelineContact, searchPipelineContacts } from "./pipeline-action-client";
import { usePipelineMutation } from "./pipeline-mutation";

export function PipelineCreate({ companyId, contactId, contacts = [] }: { companyId: string; contactId?: string; contacts?: readonly ContactDTO[] }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [searchedQuery, setSearchedQuery] = useState("");
  const [candidates, setCandidates] = useState<ContactDTO[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<ContactDTO | null>(contacts.find(contact => contact.id === contactId) ?? null);
  const [title, setTitle] = useState("");
  const [validation, setValidation] = useState<string | null>(null);
  const [searchError, setSearchError] = useState<string | null>(null);
  const searchBusy = useRef(false);
  const mutation = usePipelineMutation(`${companyId}:pipeline:create`, companyId);

  async function search(next?: string) {
    if (searchBusy.current || mutation.locked) return;
    searchBusy.current = true; setSearching(true); setSearchError(null);
    const searchValue = next ? searchedQuery : query.trim();
    try {
      const result = await searchPipelineContacts(companyId, searchValue, next);
      if (!result.ok) { setSearchError(pipelineActionMessage(result.error.code)); return; }
      setCandidates(previous => next ? [...new Map([...previous, ...result.data.items].map(contact => [contact.id, contact])).values()] : result.data.items);
      setCursor(result.data.next_cursor); setSearchedQuery(searchValue);
    } catch { setSearchError("No pudimos cargar los contactos. Volvé a buscar para intentar de nuevo."); }
    finally { searchBusy.current = false; setSearching(false); }
  }

  async function toggle() {
    if (mutation.locked || searching) return;
    if (open) { setOpen(false); return; }
    setOpen(true); setValidation(null);
    if (!selected && contactId) {
      setSearching(true);
      try {
        const result = await readPipelineContact(companyId, contactId);
        if (result.ok) setSelected(result.data.contact);
        else setSearchError(pipelineActionMessage(result.error.code));
      } catch { setSearchError("No pudimos cargar el contacto seleccionado. Buscalo por nombre o teléfono."); }
      finally { setSearching(false); }
    }
    await search();
  }

  async function create(event: FormEvent) {
    event.preventDefault();
    const parsed = CreateDealInputSchema.safeParse({ contact_id: selected?.id, title });
    if (!parsed.success) { setValidation("Elegí un contacto y escribí un título para la oportunidad."); return; }
    setValidation(null);
    const result = await mutation.submit("/api/crm/deals", parsed.data, "Creamos la oportunidad en la etapa Nuevo.");
    if (result) { setOpen(false); setTitle(""); }
  }

  const options = [...(selected && !candidates.some(contact => contact.id === selected.id) ? [selected] : []), ...candidates];
  return <div className="space-y-4">
    <Button icon={Plus} onClick={() => void toggle()} disabled={mutation.locked || searching} aria-expanded={open}>Crear oportunidad</Button>
    {!open && mutation.success && <Alert tone="success">{mutation.success}</Alert>}
    {open && <Card className="space-y-5 border border-line bg-canvas" aria-label="Crear oportunidad">
      <h2 className="text-lg font-bold">Nueva oportunidad</h2>
      <div className="space-y-4">
        <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
          <Input label="Buscar contacto para la oportunidad" value={query} icon={Search} maxLength={100}
            className="min-w-0 flex-1" placeholder="Nombre, empresa o teléfono" disabled={mutation.locked || searching}
            onChange={event => setQuery(event.target.value)} onKeyDown={event => { if (event.key === "Enter") { event.preventDefault(); void search(); } }} />
          <Button variant="secondary" loading={searching} disabled={mutation.locked} onClick={() => void search()}>Buscar contactos</Button>
        </div>
        {searchError && <Alert tone="danger">{searchError}</Alert>}
        <Select label="Contacto de la oportunidad" value={selected?.id ?? ""} disabled={mutation.locked || searching}
          placeholder="Elegí un contacto" options={options.map(contact => ({ value: contact.id, label: `${contact.name} · ${contact.phone_e164}` }))}
          onChange={event => setSelected(options.find(contact => contact.id === event.target.value) ?? null)} />
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs text-ink-muted">{candidates.length} contactos cargados{cursor ? ". Hay más resultados: cargalos o ajustá la búsqueda." : "."}</p>
          {cursor && <Button variant="ghost" size="sm" disabled={mutation.locked || query.trim() !== searchedQuery} loading={searching}
            onClick={() => void search(cursor)}>Cargar más contactos</Button>}
        </div>
      </div>
      <form onSubmit={create} className="space-y-5">
        <Input name="title" label="Título de la oportunidad" value={title} required maxLength={200}
          disabled={mutation.locked} onChange={event => setTitle(event.target.value)} placeholder="Por ejemplo, propuesta de servicios" />
        {selected && <p className="break-words text-sm text-ink-muted">Contacto seleccionado: <strong className="text-ink">{selected.name}</strong></p>}
        <p className="text-xs text-ink-muted">La oportunidad empieza en Nuevo. Un contacto puede tener varias oportunidades.</p>
        {validation && <Alert tone="danger">{validation}</Alert>}
        {mutation.error && <Alert tone={mutation.uncertain ? "warning" : "danger"} title={mutation.uncertain ? "Guardado pendiente de confirmar" : "Revisá la oportunidad"}>{mutation.error}</Alert>}
        <div className="flex flex-wrap gap-2.5">
          <Button type="submit" loading={mutation.pending} disabled={searching}>{mutation.uncertain ? "Confirmar creación" : "Guardar oportunidad"}</Button>
          <Button variant="ghost" disabled={mutation.locked || searching} onClick={() => setOpen(false)}>Cerrar formulario</Button>
        </div>
      </form>
    </Card>}
  </div>;
}
