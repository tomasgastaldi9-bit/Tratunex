import { Lock, Mail } from "lucide-react";
import { Alert } from "@/components/ui/Alert";
import { buttonStyles } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { signIn } from "./actions";
import { AuthFrame } from "./AuthFrame";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const { error } = await searchParams;
  return (
    <AuthFrame title="Ingresar a Tratunex" description="Usá tu correo y contraseña para acceder.">
      {error && (
        <Alert tone="danger">
          {error === "unavailable" ? "El servicio de acceso no está disponible. Intentá más tarde." : "No pudimos iniciar sesión. Revisá tus datos."}
        </Alert>
      )}
      <form action={signIn} className="flex flex-col gap-5 rounded-card border border-line bg-surface p-6 shadow-card">
        <Input label="Correo" name="email" type="email" autoComplete="email" icon={Mail} required />
        <Input label="Contraseña" name="password" type="password" autoComplete="current-password" icon={Lock} required />
        <button type="submit" className={buttonStyles({ className: "min-h-11 w-full" })}>
          Ingresar
        </button>
      </form>
    </AuthFrame>
  );
}
