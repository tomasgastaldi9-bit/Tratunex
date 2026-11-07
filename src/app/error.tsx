"use client";
import { Button } from "@/components/ui/Button";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="mx-auto my-20 max-w-2xl space-y-5 p-6" role="alert"><h1 className="text-2xl font-bold">No pudimos cargar el CRM</h1>
    <p className="text-sm text-ink-muted">Ocurrió un error al consultar los datos de demostración.</p>
    <Button onClick={reset}>Volver a intentar</Button>
  </main>;
}
