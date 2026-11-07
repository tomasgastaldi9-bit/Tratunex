import { redirect } from "next/navigation";
import { AppShell } from "@/components/ui/AppShell";
import { getCompanyContext } from "@/features/platform/server/public";
import { SearchForm } from "./SearchForm";

export default async function ProspectsPage() {
  const context = await getCompanyContext(undefined, { readOnlyCookies: true });
  if (!context.ok && (context.error.code === "FORBIDDEN" || context.error.code === "VALIDATION_ERROR")) redirect("/login/companies");
  if (!context.ok) return <main role="alert">No pudimos comprobar tu acceso. Intentá de nuevo.</main>;
  return <AppShell><header><h1 className="text-2xl font-bold">Prospección</h1><p className="mt-2 text-ink-muted">Encontrá empresas por rubro y zona, con su fuente de origen.</p></header><SearchForm initial={{ actionId: crypto.randomUUID() }} /></AppShell>;
}
