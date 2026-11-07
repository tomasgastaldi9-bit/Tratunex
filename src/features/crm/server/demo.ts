import "server-only";
import { mockCrm } from "./mock-instance";
import { buildCrmDemo } from "./read-model";
export type { CrmDemoData, DemoCompany } from "./read-model";

// Selección de escenarios ficticios, nunca una sesión ni un company_id del cliente.
// Al integrar auth, Plataforma debe proporcionar el Ctx desde la membresía real.
export function readCrmDemo(value?: string | string[]) {
  return buildCrmDemo(mockCrm.snapshot(), value);
}
