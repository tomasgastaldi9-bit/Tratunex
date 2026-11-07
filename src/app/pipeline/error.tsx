"use client";

import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { AppShell } from "@/components/ui/AppShell";

export default function PipelineError({ reset }: { reset: () => void }) {
  return <AppShell><Alert tone="danger" title="No pudimos cargar el pipeline">Volvé a intentar para consultar las oportunidades de tu empresa.</Alert>
    <div><Button onClick={reset} variant="secondary">Volver a intentar</Button></div></AppShell>;
}
