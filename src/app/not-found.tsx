import Link from "next/link";
import { Suspense } from "react";
import { DemoBackLink } from "@/features/crm/components/demo-back-link";
import { buttonStyles } from "@/components/ui/Button";
import { ModeBadge } from "@/components/ui/StatusBadges";

export default function NotFound() {
  return <main className="mx-auto my-20 max-w-2xl space-y-5 p-6"><ModeBadge mode="mock" />
    <h1 className="text-2xl font-bold">No encontramos este contacto o página</h1>
    <p className="text-sm text-ink-muted">Comprobá la dirección y la empresa de demostración seleccionada.</p>
    <Suspense fallback={<Link className={buttonStyles()} href="/pipeline">Volver al pipeline</Link>}><DemoBackLink /></Suspense>
  </main>;
}
