"use client";

import { Alert } from "@/components/ui/Alert";
import { AppShell } from "@/components/ui/AppShell";
import { Button } from "@/components/ui/Button";

export default function SuppliersError({ reset }: { reset: () => void }) {
  return <AppShell><Alert tone="danger" title="No pudimos cargar los proveedores">Volvé a intentar para consultar los proveedores de tu empresa.</Alert>
    <div><Button variant="secondary" onClick={reset}>Volver a intentar</Button></div></AppShell>;
}
