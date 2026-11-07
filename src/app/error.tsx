"use client";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return <main className="standalone-state" role="alert"><h1>No pudimos cargar el CRM</h1>
    <p>Ocurrió un error al consultar los datos de demostración.</p>
    <button className="button button-primary" onClick={reset}>Volver a intentar</button>
  </main>;
}
