/**
 * Datos de prueba para la demo, mientras la base compartida no tiene las
 * tablas de proveedores y órdenes (suppliers.sql y purchase-orders.sql sin
 * aplicar). Son los mismos proveedores ficticios del comparador de ejemplo
 * (quote-comparison-example.ts), así la historia es la misma en todas las
 * pantallas.
 *
 * Todo es ficticio: nunca se guarda, no se puede editar y no se usa para
 * pagar. Los teléfonos están en el rango reservado de ficción (+1 202 555 01xx)
 * y las billeteras son direcciones de ejemplo, no de nadie.
 */

/** El mensaje que devuelve el CRM cuando la base no tiene sus tablas. */
export const MISSING_SCHEMA_MESSAGE = "El esquema CRM todavía no está disponible en esta base.";

export function isMissingCrmSchema(error: { code: string; message?: string }): boolean {
  return error.code === "PROVIDER_UNAVAILABLE" && error.message === MISSING_SCHEMA_MESSAGE;
}

export type ExampleSupplier = {
  id: string;
  name: string;
  contact: string;
  phone: string;
  source: "Búsqueda web" | "Carga manual";
  wallet: { chain: "Arbitrum"; address: string } | null;
  accepts_argt: "Sí" | "No" | "Sin confirmar";
};

export const EXAMPLE_SUPPLIERS: readonly ExampleSupplier[] = [
  {
    id: "00000000-0000-4000-8000-000000000200",
    name: "Sur Envases · ficticio",
    contact: "Mariana (ventas)",
    phone: "+1 202 555 0101",
    source: "Búsqueda web",
    wallet: { chain: "Arbitrum", address: "0x5a17c0de00000000000000000000000000000001" },
    accepts_argt: "Sí",
  },
  {
    id: "00000000-0000-4000-8000-000000000201",
    name: "Papel del Centro · ficticio",
    contact: "Jorge (dueño)",
    phone: "+1 202 555 0102",
    source: "Búsqueda web",
    wallet: null,
    accepts_argt: "Sin confirmar",
  },
  {
    id: "00000000-0000-4000-8000-000000000202",
    name: "Vasos del Río · ficticio",
    contact: "Atención comercial",
    phone: "+1 202 555 0103",
    source: "Carga manual",
    wallet: null,
    accepts_argt: "No",
  },
];

export type ExampleOrder = {
  id: string;
  product: string;
  supplier: string;
  quantity: number;
  unit: string;
  unit_price_ars: number;
  status: "Pendiente de aprobación";
};

/** La orden que saldría de elegir la cotización recomendada del comparador de ejemplo. */
export const EXAMPLE_ORDERS: readonly ExampleOrder[] = [
  {
    id: "00000000-0000-4000-8000-000000000400",
    product: "Vasos de papel de 240 cc",
    supplier: "Sur Envases · ficticio",
    quantity: 500,
    unit: "unidades",
    unit_price_ars: 180,
    status: "Pendiente de aprobación",
  },
];
