import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

const route = vi.hoisted(() => ({ pathname: "/orders/quotes" as string | null }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));

import { Sidebar } from "./Sidebar";

const render = () => renderToStaticMarkup(<Sidebar />);
const links = (html: string) => html.match(/<a\b[^>]*>/g) ?? [];
const current = (html: string) => links(html).filter(link => link.includes('aria-current="page"'));

describe("ORD04: menú accesible compartido", () => {
  beforeEach(() => { route.pathname = "/orders/quotes"; });

  it("presenta cuatro enlaces con nombres completos y una sola selección en cotizaciones", () => {
    const html = render();
    expect(links(html)).toHaveLength(4);
    for (const label of ["Nueva compra", "Proveedores", "Cotizaciones", "Pagos"]) expect(html).toContain(label);
    expect(current(html)).toHaveLength(1);
    expect(current(html)[0]).toContain('href="/orders/quotes"');
    expect(html).not.toContain('href="/agent"');
    expect(html).not.toContain('href="/calls"');
    expect(html).not.toContain('href="/pipeline"');
    expect(html).not.toContain('href="/tasks"');
  });

  it("actualiza la selección entre rutas anidadas y sus alias sin acumular aria-current", () => {
    for (const [pathname, href] of [["/orders/quotes/example", "/orders/quotes"], ["/orders/orden", "/orders"], ["/prospects/busqueda", "/suppliers"], ["/agent/rules", "/purchases/new"]]) {
      route.pathname = pathname;
      const selected = current(render());
      expect(selected).toHaveLength(1);
      expect(selected[0]).toContain(`href="${href}"`);
    }
  });

  it("renderiza sin selección si el pathname aún no está disponible o la página quedó fuera del recorrido", () => {
    for (const pathname of [null, "/agent/knowledge"]) {
      route.pathname = pathname;
      expect(current(render())).toHaveLength(0);
      expect(links(render())).toHaveLength(4);
    }
  });
});
