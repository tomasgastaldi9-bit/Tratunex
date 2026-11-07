import { z } from "zod";
import { ctxSchema, type Ctx, type Result } from "../../../contracts/common";
import { crmFailure } from "./persistent-crm";

export type CrmClientAuthorization<T> = {
  verifyUser: (companyId: string) => Promise<Result<Ctx>>;
  createUserClient: () => Promise<T>;
  createServiceClient: () => Promise<Result<T>>;
};

/** A Ctx argument is not itself proof of permission. Revalidate users per call. */
export async function authorizeCrmClient<T>(ctx: Ctx, deps: CrmClientAuthorization<T>): Promise<Result<T>> {
  const valid = ctxSchema.extend({ company_id: z.uuid(), actor_id: z.uuid() }).safeParse(ctx);
  if (!valid.success) return crmFailure("VALIDATION_ERROR", "El contexto del CRM no es válido.");
  try {
    if (ctx.actor_type === "user") {
      const current = await deps.verifyUser(ctx.company_id);
      if (!current.ok) return current;
      if (current.data.actor_type !== "user" || current.data.actor_id !== ctx.actor_id || current.data.company_id !== ctx.company_id) {
        return crmFailure("FORBIDDEN", "El actor o la empresa no coinciden con la sesión vigente.");
      }
      return { ok: true, data: await deps.createUserClient() };
    }
    return deps.createServiceClient();
  } catch {
    return crmFailure("PROVIDER_UNAVAILABLE", "No se pudo establecer una conexión autorizada con el CRM.", true);
  }
}
