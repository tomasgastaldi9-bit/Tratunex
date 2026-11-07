import { describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("./supplier-view", () => ({ SuppliersFrame: ({ children }: { children: ReactNode }) => <main>{children}</main> }));

import { isMissingCrmSchema, MISSING_SCHEMA_MESSAGE } from "../mocks/demo-examples";
import { OrdersExampleView, SuppliersExampleView } from "./demo-example-views";

describe("datos de prueba para la demo", () => {
  it("solo se usan cuando la base no tiene las tablas del CRM", () => {
    expect(isMissingCrmSchema({ code: "PROVIDER_UNAVAILABLE", message: MISSING_SCHEMA_MESSAGE })).toBe(true);
    expect(isMissingCrmSchema({ code: "PROVIDER_UNAVAILABLE", message: "No se pudo consultar el CRM." })).toBe(false);
    expect(isMissingCrmSchema({ code: "FORBIDDEN", message: MISSING_SCHEMA_MESSAGE })).toBe(false);
  });

  it("muestra los proveedores ficticios rotulados y sin acciones de edición", () => {
    const html = renderToStaticMarkup(<SuppliersExampleView />);
    expect(html).toContain("Ejemplo: proveedores de muestra mientras se carga la base.");
    expect(html).toContain('Ejemplo<span class="sr-only"> (datos de prueba)</span>');
    expect(html).toContain("Sur Envases · ficticio");
    expect(html).toContain("Vasos del Río · ficticio");
    expect(html).not.toContain("Agregar proveedor");
    expect(html).not.toContain('href="/suppliers/00000000');
  });

  it("muestra la orden de ejemplo sin pago ni hash", () => {
    const html = renderToStaticMarkup(<OrdersExampleView />);
    expect(html).toContain("Ejemplo: órdenes de muestra mientras se carga la base.");
    expect(html).toContain('Ejemplo<span class="sr-only"> (datos de prueba)</span>');
    expect(html).toContain("Sin pagar");
    expect(html).not.toMatch(/0x[0-9a-f]{64}/i);
  });
});
