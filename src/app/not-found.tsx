import Link from "next/link";
import { Suspense } from "react";
import { DemoBackLink } from "@/components/ui/demo-back-link";

export default function NotFound() {
  return <main className="standalone-state"><span className="badge badge-amber">Mock · datos ficticios</span>
    <h1>No encontramos este contacto o página</h1>
    <p>Comprobá la dirección y la empresa de demostración seleccionada.</p>
    <Suspense fallback={<Link className="button button-primary" href="/pipeline">Volver al pipeline</Link>}><DemoBackLink /></Suspense>
  </main>;
}
