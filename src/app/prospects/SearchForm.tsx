"use client";
import { FlaskConical } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { submitImport, submitSearch, type SearchState } from "./actions";

function CandidateForm({ id, actionId }: { id: string; actionId: string }) {
  const [state, action, pending] = useActionState(submitImport, { actionId });
  return <form action={action}><input type="hidden" name="action_id" value={state.actionId} /><input type="hidden" name="candidate_id" value={id} /><button className="mt-3 underline disabled:opacity-50" type="submit" disabled={pending || state.done}>{pending ? "Importando…" : state.done ? "Importado" : "Importar al CRM"}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}

function Submit() { const { pending } = useFormStatus(); return <Button type="submit" loading={pending}>{pending ? "Buscando…" : "Buscar prospectos"}</Button>; }
export function SearchForm({ initial }: { initial: SearchState }) {
  const [state, action] = useActionState(submitSearch, initial);
  return <>
    <form action={action} className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2"><Input label="Rubro" name="query" placeholder="Ej. panaderías" required maxLength={120} /><Input label="Zona" name="location" placeholder="Ej. Córdoba" required maxLength={120} /></div>
      <input type="hidden" name="action_id" value={state.actionId} />
      <div><Submit /></div>
    </form>
    {state.error && <div role="alert" className="text-danger"><p>{state.error}</p><p>Empezar otra búsqueda puede volver a consultar al proveedor y consumir créditos.</p><a className="underline" href="/prospects">Empezar otra búsqueda</a></div>}
    {state.result && <section aria-live="polite" className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Resultados ({state.result.candidates.length})</h2>{state.result.mode === "mock" ? <Badge icon={FlaskConical}>Ejemplo<span className="sr-only"> (datos de prueba)</span></Badge> : <span className="text-sm">Búsqueda real con Firecrawl</span>}</div>
      {state.result.candidates.length === 0 && <p>No se encontraron resultados para esta búsqueda.</p>}
      {state.result.candidates.map(candidate => <article key={candidate.id} className="rounded-xl bg-white p-5 shadow-sm"><h3 className="font-bold">{candidate.name}</h3><p className="mt-2 text-sm">{candidate.phone ? `Posible teléfono: ${candidate.phone} (revisá la fuente)` : "Sin teléfono disponible"}</p><p className="mt-2 text-sm"><a className="underline" href={candidate.website} target="_blank" rel="noopener noreferrer">Sitio de la fuente</a> · <a className="underline" href={candidate.source_url} target="_blank" rel="noopener noreferrer">Ver fuente</a></p>{candidate.evidence && <p className="mt-2 text-xs text-ink-muted">{candidate.evidence}</p>}{state.result?.mode === "live" && <CandidateForm id={candidate.id} actionId={candidate.importActionId} />}</article>)}
    </section>}
  </>;
}
