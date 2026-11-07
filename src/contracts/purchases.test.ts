import { describe, expect, it } from "vitest";
import {
  atomicToPesos,
  decidePurchasePolicy,
  formatPesos,
  pesosToAtomic,
  purchasePolicySchema,
  purchaseRequestInputSchema,
} from "./purchases";

const PROVEEDOR_A = "11111111-1111-4111-8111-111111111111";
const PROVEEDOR_B = "22222222-2222-4222-8222-222222222222";

const reglas = purchasePolicySchema.parse({
  max_per_purchase_atomic: pesosToAtomic(500_000),
  auto_pay_limit_atomic: pesosToAtomic(100_000),
  only_allowed_suppliers: true,
  allowed_supplier_ids: [PROVEEDOR_A],
});

describe("montos en ARGt", () => {
  it("convierte pesos a unidades mínimas y vuelve sin perder nada", () => {
    expect(pesosToAtomic(1)).toBe("1000000000000000000");
    expect(atomicToPesos(pesosToAtomic(123_456))).toBe(BigInt(123_456));
    expect(formatPesos(pesosToAtomic(100_000))).toBe("$ 100.000");
  });
});

describe("purchaseRequestInputSchema", () => {
  const compra = {
    product: " Vasos térmicos 240 cc ",
    quantity: 500,
    unit: "",
    needed_by: "2026-11-09",
    budget_atomic: pesosToAtomic(300_000),
    zone: "CABA",
  };

  it("acepta una compra completa y saca espacios", () => {
    expect(purchaseRequestInputSchema.parse(compra).product).toBe("Vasos térmicos 240 cc");
  });

  it("rechaza cantidad 0, presupuesto 0, fecha mal escrita y producto vacío", () => {
    expect(purchaseRequestInputSchema.safeParse({ ...compra, quantity: 0 }).success).toBe(false);
    expect(purchaseRequestInputSchema.safeParse({ ...compra, budget_atomic: "0" }).success).toBe(false);
    expect(purchaseRequestInputSchema.safeParse({ ...compra, needed_by: "9/11" }).success).toBe(false);
    expect(purchaseRequestInputSchema.safeParse({ ...compra, product: " " }).success).toBe(false);
  });
});

describe("purchasePolicySchema", () => {
  it("rechaza que lo que paga solo supere el máximo", () => {
    const resultado = purchasePolicySchema.safeParse({
      max_per_purchase_atomic: pesosToAtomic(100),
      auto_pay_limit_atomic: pesosToAtomic(200),
      only_allowed_suppliers: false,
      allowed_supplier_ids: [],
    });
    expect(resultado.success).toBe(false);
  });

  it("rechaza el filtro de proveedores activo sin ningún proveedor", () => {
    const resultado = purchasePolicySchema.safeParse({
      max_per_purchase_atomic: pesosToAtomic(100),
      auto_pay_limit_atomic: pesosToAtomic(50),
      only_allowed_suppliers: true,
      allowed_supplier_ids: [],
    });
    expect(resultado.success).toBe(false);
  });
});

describe("decidePurchasePolicy", () => {
  it("sin reglas pide aprobación", () => {
    expect(decidePurchasePolicy(null, pesosToAtomic(10), PROVEEDOR_A).decision).toBe("needs_approval");
  });

  it("dentro del límite y proveedor permitido: paga solo", () => {
    const resultado = decidePurchasePolicy(reglas, pesosToAtomic(80_000), PROVEEDOR_A);
    expect(resultado.decision).toBe("auto_pay");
    expect(resultado.reason).toContain("$ 80.000");
  });

  it("justo en el límite paga solo; un peso más pide aprobación", () => {
    expect(decidePurchasePolicy(reglas, pesosToAtomic(100_000), PROVEEDOR_A).decision).toBe("auto_pay");
    expect(decidePurchasePolicy(reglas, pesosToAtomic(100_001), PROVEEDOR_A).decision).toBe("needs_approval");
  });

  it("arriba del máximo rechaza, aunque el proveedor esté permitido", () => {
    expect(decidePurchasePolicy(reglas, pesosToAtomic(600_000), PROVEEDOR_A).decision).toBe("rejected");
  });

  it("proveedor fuera de la lista: rechaza", () => {
    expect(decidePurchasePolicy(reglas, pesosToAtomic(10), PROVEEDOR_B).decision).toBe("rejected");
  });

  it("con el filtro apagado, cualquier proveedor sigue las reglas de monto", () => {
    const sinFiltro = { ...reglas, only_allowed_suppliers: false };
    expect(decidePurchasePolicy(sinFiltro, pesosToAtomic(10), PROVEEDOR_B).decision).toBe("auto_pay");
  });
});

describe("montos mal escritos", () => {
  it("un monto con coma o negativo da error de validación, no una excepción", () => {
    expect(() => purchaseRequestInputSchema.safeParse({
      product: "Vasos", quantity: 1, unit: "", needed_by: "2026-11-09", budget_atomic: "1.5", zone: "",
    })).not.toThrow();
    expect(purchaseRequestInputSchema.safeParse({
      product: "Vasos", quantity: 1, unit: "", needed_by: "2026-11-09", budget_atomic: "-3", zone: "",
    }).success).toBe(false);
    expect(() => purchasePolicySchema.safeParse({
      max_per_purchase_atomic: "1.5", auto_pay_limit_atomic: "abc", only_allowed_suppliers: false, allowed_supplier_ids: [],
    })).not.toThrow();
  });
});
