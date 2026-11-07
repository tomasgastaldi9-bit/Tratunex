"use client";
import { useRef, useState } from "react";
import { parseProspectCsv, type CsvParseResult } from "@/features/discovery/import/csv";

export function CsvPreview() {
  const [result, setResult] = useState<CsvParseResult | null>(null);
  const readVersion = useRef(0);
  async function readFile(file: File | undefined) {
    const version = ++readVersion.current;
    setResult(null);
    if (!file) return;
    if (file.size > 256 * 1024) { setResult({ ok: false, error: "El archivo supera 256 KB." }); return; }
    try { const text = await file.text(); if (version === readVersion.current) setResult(parseProspectCsv(text)); }
    catch { if (version === readVersion.current) setResult({ ok: false, error: "No pudimos leer el archivo." }); }
  }
  return <section className="flex flex-col gap-4 rounded-xl bg-white p-6 shadow-sm" aria-labelledby="csv-title">
    <div><h2 id="csv-title" className="text-lg font-bold">Preparar importación por CSV</h2><p className="mt-1 text-sm text-ink-muted">Revisá el archivo antes de importarlo. La conexión con Contactos está en desarrollo: esta vista no crea contactos.</p></div>
    <label className="text-sm font-bold" htmlFor="prospect-csv">Archivo CSV</label>
    <input id="prospect-csv" type="file" accept=".csv,text/csv" onChange={(event) => void readFile(event.target.files?.[0])} />
    <p className="text-sm text-ink-muted">Columnas: nombre, telefono, web. El teléfono necesita código de país, por ejemplo +54; web puede quedar vacía. Hasta 500 registros y 256 KB. La numeración omite filas vacías.</p>
    {result && !result.ok && <p role="alert" className="text-danger">{result.error}</p>}
    {result?.ok && <div aria-live="polite" className="flex flex-col gap-3"><p>{result.rows.length} filas · {result.rows.filter((row) => row.errors.length > 0).length} con errores</p>
      {result.rows.map((row) => <article key={row.row} className="rounded-control bg-surface p-3 text-sm"><p className="font-bold">Registro {row.row}: {row.name || "Sin nombre"}</p><p>{row.phone_e164 ?? "Teléfono inválido"}{row.website ? ` · ${row.website}` : " · Sin web"}</p>{row.errors.map((error) => <p key={error} className="text-danger">{error}</p>)}</article>)}
    </div>}
  </section>;
}
