import { signIn } from "./actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <main>
      <h1>Ingresar a Tratunex</h1>
      <p>Usá tu correo y contraseña para acceder.</p>
      {error && <p role="alert">{error === "unavailable" ? "El servicio de acceso no está disponible. Intentá más tarde." : "No pudimos iniciar sesión. Revisá tus datos."}</p>}
      <form action={signIn}>
        <label>Correo <input name="email" type="email" autoComplete="email" required /></label>
        <label>Contraseña <input name="password" type="password" autoComplete="current-password" required /></label>
        <button type="submit">Ingresar</button>
      </form>
    </main>
  );
}
