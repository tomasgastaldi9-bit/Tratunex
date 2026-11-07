import type { ReactNode } from "react";

/**
 * Marco de las pantallas de acceso (ingresar y elegir empresa): panel oscuro
 * con la marca a la izquierda (solo en compu) y la tarjeta del formulario a la
 * derecha. No lleva menú: todavía no hay empresa elegida.
 */
export function AuthFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden overflow-hidden bg-[linear-gradient(150deg,var(--color-graphite-soft)_0%,var(--color-ink)_60%,var(--color-graphite)_100%)] p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <span aria-hidden className="pointer-events-none absolute -right-32 -bottom-40 size-[520px] rounded-full border border-white/[0.07]" />
        <span aria-hidden className="pointer-events-none absolute -right-10 -bottom-24 size-[360px] rounded-full bg-white/[0.04]" />
        <p className="relative flex items-center gap-3">
          <span className="flex size-11 items-center justify-center rounded-[14px] bg-white text-xl font-bold text-ink">t</span>
          <span className="text-2xl font-semibold tracking-tight">
            Tratu<span className="text-white/45">nex</span>
          </span>
        </p>
        <div className="relative flex max-w-md flex-col gap-4">
          <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/65 uppercase">
            <span aria-hidden className="size-1.5 rounded-full bg-white" />
            Agente de compras para pymes
          </p>
          <p className="text-4xl leading-[1.1] font-semibold tracking-tight">
            Cotiza con tus proveedores, compara y paga por vos.
          </p>
          <p className="text-base leading-relaxed text-white/70">
            Vos ponés las reglas. El agente llama, elige la mejor oferta, te explica por qué y paga en ARGt.
          </p>
        </div>
        <p className="relative text-xs text-white/40">Pagos en ARGt (Twin) · Precio de referencia de Belo</p>
      </aside>

      <main className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-[420px] flex-col gap-6">
          <p className="flex items-center gap-2 lg:hidden">
            <span className="flex size-10 items-center justify-center rounded-[12px] bg-ink text-lg font-bold text-white">t</span>
            <span className="text-xl font-semibold tracking-tight">Tratunex</span>
          </p>
          <div className="flex flex-col gap-2">
            <h1 className="text-3xl leading-tight font-semibold tracking-tight">{title}</h1>
            {description && <p className="text-[15px] text-ink-muted">{description}</p>}
          </div>
          {children}
        </div>
      </main>
    </div>
  );
}
