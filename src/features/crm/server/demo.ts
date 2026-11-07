import "server-only";
import { cookies } from "next/headers";
import { mockCrm } from "./mock-instance";
import { buildCrmDemo } from "./read-model";
export type { CrmDemoData, DemoCompany } from "./read-model";

// Selección de escenarios ficticios, nunca una sesión ni un company_id del cliente.
// Al integrar auth, Plataforma debe proporcionar el Ctx desde la membresía real.
export function readCrmDemo(value?: string | string[]) {
  return buildCrmDemo(mockCrm.snapshot(), value);
}

// Conserva el escenario al navegar con el menú compartido de Vale, sin modificarlo.
export async function readCrmPageDemo(value?: string | string[]) {
  const remembered = value === undefined ? (await cookies()).get("tratunex_demo")?.value : value;
  return readCrmDemo(remembered);
}
