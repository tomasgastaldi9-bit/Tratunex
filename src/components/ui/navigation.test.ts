import { describe, expect, it } from "vitest";
import { getActiveNavHref, NAV_ITEMS } from "./navigation";

describe("ORD04: recorrido principal de compras", () => {
  it("ofrece los cuatro pasos en el orden de la demo", () => {
    expect(NAV_ITEMS.map(({ href, label }) => ({ href, label }))).toEqual([
      { href: "/purchases/new", label: "Nueva compra" },
      { href: "/suppliers", label: "Proveedores" },
      { href: "/orders/quotes", label: "Cotizaciones" },
      { href: "/orders", label: "Pagos" },
    ]);
  });

  it.each([
    ["/purchases/new", "/purchases/new"],
    ["/purchases/new/", "/purchases/new"],
    ["/suppliers", "/suppliers"],
    ["/suppliers/proveedor", "/suppliers"],
    ["/orders/quotes", "/orders/quotes"],
    ["/orders/quotes/example", "/orders/quotes"],
    ["/orders", "/orders"],
    ["/orders/orden", "/orders"],
    ["/calls/quotes", "/orders/quotes"],
    ["/calls/quotes/cotizacion", "/orders/quotes"],
    ["/prospects", "/suppliers"],
    ["/prospects/busqueda", "/suppliers"],
    ["/agent/rules", "/purchases/new"],
    ["/agent/rules/configuracion", "/purchases/new"],
  ])("resuelve %s como %s", (pathname, href) => {
    expect(getActiveNavHref(pathname)).toBe(href);
  });

  it.each([null, "", "/", "/agent", "/agent/knowledge", "/agent/rules-other", "/calls", "/calls/otra", "/pipeline", "/tasks", "/suppliers-other", "/orders-other"])(
    "no selecciona un paso de compra para %s", pathname => {
      expect(getActiveNavHref(pathname)).toBeNull();
    },
  );
});
