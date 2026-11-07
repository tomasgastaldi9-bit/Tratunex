import { ArrowRight, Check } from "lucide-react";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { isAuthUnavailable, selectedCompanyCookie } from "@/lib/auth/company";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { selectCompany, signOut } from "../actions";
import { AuthFrame } from "../AuthFrame";

function Unavailable() {
  return (
    <AuthFrame title="Elegí una empresa">
      <Alert tone="danger">El servicio de acceso no está disponible. Intentá más tarde.</Alert>
    </AuthFrame>
  );
}

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  let client;
  try {
    client = await createRequestSupabaseClient({ readOnlyCookies: true });
  } catch {
    return <Unavailable />;
  }
  let authResult;
  try {
    authResult = await client.auth.getUser();
  } catch {
    return <Unavailable />;
  }
  const { data: { user }, error: authError } = authResult;
  if (authError && isAuthUnavailable(authError)) {
    return <Unavailable />;
  }
  if (authError || !user) redirect("/login");
  const { data: companies, error } = await client.from("companies").select("id,name").order("name");
  const selected = (await cookies()).get(selectedCompanyCookie)?.value;
  const { error: selectionError } = await searchParams;
  return (
    <AuthFrame title="Elegí una empresa" description="Trabajás con los proveedores, compras y pagos de la empresa que elijas.">
      {error ? <Alert tone="danger">No pudimos cargar tus empresas. Intentá de nuevo.</Alert> : null}
      {selectionError ? (
        <Alert tone="danger">
          {selectionError === "signout" ? "No pudimos cerrar sesión. Intentá de nuevo." : selectionError === "unavailable" ? "No pudimos comprobar tu acceso. Intentá de nuevo." : "No tenés acceso a esa empresa."}
        </Alert>
      ) : null}
      {!error && companies?.length === 0 ? <Alert tone="warning">Tu usuario todavía no pertenece a ninguna empresa.</Alert> : null}
      {companies && companies.length > 0 ? (
        <ul className="divide-y divide-line rounded-card border border-line">
          {companies.map((company) => {
            const isSelected = selected === company.id;
            return (
              <li key={company.id}>
                <form action={selectCompany}>
                  <input type="hidden" name="company_id" value={company.id} />
                  <button
                    type="submit"
                    className="flex w-full items-center gap-3 px-4 py-3 text-left text-sm transition-colors first:rounded-t-card hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
                  >
                    <span className={`min-w-0 grow ${isSelected ? "font-medium" : ""}`}>
                      {company.name}
                      {isSelected ? <span className="sr-only"> (seleccionada)</span> : null}
                    </span>
                    {isSelected ? <Check size={16} aria-hidden className="shrink-0" /> : null}
                  </button>
                </form>
              </li>
            );
          })}
        </ul>
      ) : null}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {companies?.some((company) => company.id === selected) ? (
          <Link href="/" className={buttonStyles()}>
            Ir al inicio
            <ArrowRight size={16} aria-hidden />
          </Link>
        ) : <span />}
        <form action={signOut}>
          <button type="submit" className={buttonStyles({ variant: "ghost" })}>
            Cerrar sesión
          </button>
        </form>
      </div>
    </AuthFrame>
  );
}
