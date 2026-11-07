import type { ReactNode } from "react";

/**
 * Marco de las pantallas de acceso (ingresar y elegir empresa): una columna
 * angosta y centrada, con el nombre de la app arriba. No lleva menú: todavía
 * no hay empresa elegida.
 */
export function AuthFrame({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen flex-col items-center bg-surface px-4 pt-[14vh] pb-12">
      <div className="flex w-full max-w-[380px] flex-col gap-8">
        <p className="text-[17px] font-semibold tracking-[-0.01em]">Tratunex</p>
        <div className="flex flex-col gap-1.5">
          <h1 className="text-2xl leading-tight font-semibold tracking-[-0.01em]">{title}</h1>
          {description && <p className="text-sm text-ink-muted">{description}</p>}
        </div>
        <div className="flex flex-col gap-5">{children}</div>
      </div>
    </main>
  );
}
