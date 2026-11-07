import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { isAuthUnavailable, selectedCompanyCookie } from "@/lib/auth/company";
import { createRequestSupabaseClient } from "@/lib/supabase/request";
import { selectCompany, signOut } from "../actions";

export default async function CompaniesPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  let client;
  try {
    client = await createRequestSupabaseClient({ readOnlyCookies: true });
  } catch {
    return <main><h1>Elegí una empresa</h1><p role="alert">El servicio de acceso no está disponible. Intentá más tarde.</p></main>;
  }
  let authResult;
  try {
    authResult = await client.auth.getUser();
  } catch {
    return <main><h1>Elegí una empresa</h1><p role="alert">El servicio de acceso no está disponible. Intentá más tarde.</p></main>;
  }
  const { data: { user }, error: authError } = authResult;
  if (authError && isAuthUnavailable(authError)) {
    return <main><h1>Elegí una empresa</h1><p role="alert">El servicio de acceso no está disponible. Intentá más tarde.</p></main>;
  }
  if (authError || !user) redirect("/login");
  const { data: companies, error } = await client.from("companies").select("id,name").order("name");
  const selected = (await cookies()).get(selectedCompanyCookie)?.value;
  const { error: selectionError } = await searchParams;
  return (
    <main>
      <h1>Elegí una empresa</h1>
      {error ? <p role="alert">No pudimos cargar tus empresas. Intentá de nuevo.</p> : null}
      {selectionError ? <p role="alert">{selectionError === "signout" ? "No pudimos cerrar sesión. Intentá de nuevo." : selectionError === "unavailable" ? "No pudimos comprobar tu acceso. Intentá de nuevo." : "No tenés acceso a esa empresa."}</p> : null}
      {!error && companies?.length === 0 ? <p>Tu usuario todavía no pertenece a ninguna empresa.</p> : null}
      {companies?.map((company) => (
        <form action={selectCompany} key={company.id}>
          <input type="hidden" name="company_id" value={company.id} />
          <button type="submit">{company.name}{selected === company.id ? " (seleccionada)" : ""}</button>
        </form>
      ))}
      {companies?.some((company) => company.id === selected) ? <p><Link href="/prospects">Ir a prospección</Link></p> : null}
      <form action={signOut}><button type="submit">Cerrar sesión</button></form>
    </main>
  );
}
