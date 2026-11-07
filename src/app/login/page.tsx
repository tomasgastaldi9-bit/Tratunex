import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signIn } from "./actions";
import { AuthFrame } from "./AuthFrame";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthFrame title="Ingresar" description="Usá tu correo y contraseña de Tratunex.">
      {error && (
        <Alert tone="danger">
          {error === "unavailable" ? "El servicio de acceso no está disponible. Intentá más tarde." : "No pudimos iniciar sesión. Revisá tus datos."}
        </Alert>
      )}
      <form action={signIn} className="flex flex-col gap-4">
        <Input label="Correo" name="email" type="email" autoComplete="email" required />
        <Input label="Contraseña" name="password" type="password" autoComplete="current-password" required />
        <button type="submit" className={buttonStyles({ className: "mt-2 min-h-10 w-full" })}>
          Ingresar
        </button>
      </form>
    </AuthFrame>
  );
}
