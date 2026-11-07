"use client";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { submitSearch, submitSupplier, type SearchState } from "./actions";

function CandidateForm({ id, actionId, phone }: { id: string; actionId: string; phone: string | null }) {
  const [state, action, pending] = useActionState(submitSupplier, { actionId });
  const e164 = phone?.replace(/[\s().-]/g, "") ?? "";
  return <form action={action} className="mt-4 flex flex-col items-start gap-2"><input type="hidden" name="action_id" value={state.actionId} /><input type="hidden" name="candidate_id" value={id} /><label className="text-sm font-medium" htmlFor={`phone-${id}`}>Teléfono del proveedor (E.164)</label><input id={`phone-${id}`} name="phone_e164" type="tel" required pattern="\+[1-9][0-9 .()-]{6,24}" defaultValue={e164} placeholder="+54 9 351 123 4567" className="rounded-control border border-line px-3 py-2" /><p className="text-xs text-ink-muted">Revisá el número en la fuente antes de guardarlo.</p><button className="rounded-control bg-ink px-4 py-2 text-white disabled:opacity-50" type="submit" disabled={pending || state.done}>{pending ? "Agregando…" : state.done ? "Agregado al CRM" : "Agregar proveedor al CRM"}</button>{state.message && <p role="status">{state.message}</p>}</form>;
}

function Submit() { const { pending } = useFormStatus(); return <Button type="submit" loading={pending}>{pending ? "Buscando…" : "Buscar proveedores"}</Button>; }
export function SearchForm({ initial }: { initial: SearchState }) {
  const [state, action] = useActionState(submitSearch, initial);
  return <>
    <form action={action} className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm">
      <div className="grid gap-4 md:grid-cols-2"><Input label="Rubro o insumo" name="query" placeholder="Ej. vasos descartables" required maxLength={120} /><Input label="Zona" name="location" placeholder="Ej. Córdoba" required maxLength={120} /></div>
      <input type="hidden" name="action_id" value={state.actionId} />
      <div><Submit /></div>
    </form>
    {state.error && <div role="alert" className="text-danger"><p>{state.error}</p><p>Empezar otra búsqueda puede volver a consultar al proveedor y consumir créditos.</p><a className="underline" href="/prospects">Empezar otra búsqueda</a></div>}
    {state.result && <section aria-live="polite" className="flex flex-col gap-3"><div className="flex items-center justify-between"><h2 className="text-lg font-bold">Resultados ({state.result.candidates.length})</h2><span className="text-sm">{state.result.mode === "mock" ? "Datos de ejemplo (mock)" : "Búsqueda real con Firecrawl"}</span></div>
      {state.result.candidates.length === 0 && <p>No se encontraron resultados para esta búsqueda.</p>}
      {state.result.candidates.map(candidate => { const products = candidate.products ?? []; const prices = candidate.prices ?? []; return <article key={candidate.id} className="rounded-xl bg-white p-5 shadow-sm"><h3 className="font-bold">{candidate.name}</h3><p className="mt-2 text-sm">{candidate.phone ? `Teléfono encontrado: ${candidate.phone}` : "Sin teléfono publicado"}</p>{products.length > 0 && <div className="mt-3"><h4 className="text-sm font-semibold">Productos publicados</h4><ul className="list-disc pl-5 text-sm">{products.map((product, index) => <li key={`${index}-${product}`}>{product}</li>)}</ul></div>}{prices.length > 0 && <div className="mt-3"><h4 className="text-sm font-semibold">Precios publicados</h4><ul className="list-disc pl-5 text-sm">{prices.map((price, index) => <li key={`${index}-${price}`}>{price}</li>)}</ul></div>}{products.length === 0 && prices.length === 0 && <p className="mt-2 text-sm text-ink-muted">No se encontraron productos o precios publicados en esta página.</p>}<p className="mt-3 text-sm"><a className="underline" href={candidate.source_url} target="_blank" rel="noopener noreferrer">Fuente de los datos</a> · <a className="underline" href={candidate.website} target="_blank" rel="noopener noreferrer">Sitio del proveedor</a></p>{candidate.evidence && <p className="mt-2 text-xs text-ink-muted">Evidencia del teléfono: {candidate.evidence}</p>}{state.result?.mode === "live" && <CandidateForm id={candidate.id} actionId={candidate.importActionId} phone={candidate.phone} />}</article>; })}
    </section>}
  </>;
}
