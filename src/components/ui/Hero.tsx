import type { ReactNode } from "react";
import { cx } from "./cx";

type HeroProps = {
  /** Texto chiquito en mayúsculas arriba del título (con un puntito). */
  eyebrow?: string;
  title: string;
  description?: string;
  /** Botones debajo del texto. Sobre fondo oscuro: usá heroButtonStyles. */
  actions?: ReactNode;
  /** Caja de la derecha (por ejemplo, la fecha de hoy). */
  aside?: ReactNode;
  className?: string;
};

/**
 * Banner oscuro de bienvenida, arriba de una pantalla importante (por ejemplo,
 * el inicio). Degradé grafito con círculos decorativos a la derecha.
 *
 * Usalo una sola vez por pantalla y solo en las principales: si todo es
 * banner, nada se destaca.
 */
export function Hero({ eyebrow, title, description, actions, aside, className }: HeroProps) {
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-hero px-6 py-8 text-white md:px-10 md:py-10",
        "bg-[linear-gradient(120deg,var(--color-ink)_0%,var(--color-graphite)_55%,var(--color-graphite-soft)_100%)]",
        className,
      )}
    >
      {/* Círculos decorativos (no dicen nada: aria-hidden). */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-24 -bottom-40 size-[420px] rounded-full border border-white/[0.07]"
      />
      <span
        aria-hidden
        className="pointer-events-none absolute -right-8 -bottom-28 size-[300px] rounded-full bg-white/[0.04]"
      />

      <div className="relative flex flex-col gap-8 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex max-w-2xl flex-col gap-4">
          {eyebrow && (
            <p className="flex items-center gap-2 text-xs font-semibold tracking-[0.18em] text-white/70 uppercase">
              <span aria-hidden className="size-1.5 rounded-full bg-white" />
              {eyebrow}
            </p>
          )}
          <h1 className="text-4xl leading-[1.05] font-semibold tracking-tight md:text-5xl">{title}</h1>
          {description && <p className="text-base leading-relaxed text-white/75 md:text-lg">{description}</p>}
          {actions && <div className="flex flex-wrap items-center gap-3 pt-2">{actions}</div>}
        </div>
        {aside && <div className="shrink-0">{aside}</div>}
      </div>
    </section>
  );
}

/** Botones pensados para ir arriba del Hero oscuro. */
export function heroButtonStyles(variant: "solid" | "outline" = "solid") {
  return cx(
    "inline-flex min-h-11 items-center justify-center gap-2 rounded-control px-5 text-sm font-semibold whitespace-nowrap",
    "transition-colors duration-150",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white",
    variant === "solid"
      ? "bg-white text-ink hover:bg-white/90"
      : "border border-white/25 bg-white/[0.06] text-white hover:bg-white/[0.12]",
  );
}
