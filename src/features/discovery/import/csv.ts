export type CsvProspect = { row: number; name: string; phone_e164: string | null; website: string | null; errors: string[] };
export type CsvParseResult = { ok: true; rows: CsvProspect[] } | { ok: false; error: string };
const MAX_BYTES = 256 * 1024;
const MAX_ROWS = 500;

function readRows(text: string): string[][] {
  const rows: string[][] = []; let row: string[] = []; let field = ""; let quoted = false; let closed = false;
  const flushField = () => { row.push(field); field = ""; closed = false; };
  const flushRow = () => { flushField(); if (row.some((cell) => cell.trim() !== "")) rows.push(row); row = []; };
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { field += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else field += char;
    } else if (char === '"') {
      if (field || closed) throw new Error("Comillas inválidas en el CSV.");
      quoted = true;
    } else if (char === ",") flushField();
    else if (char === "\n" || char === "\r") { if (char === "\r" && text[i + 1] === "\n") i++; flushRow(); }
    else { if (closed) throw new Error("Contenido después de comillas de cierre."); field += char; }
    if (rows.length > MAX_ROWS + 1) throw new Error("El archivo supera las 500 filas.");
  }
  if (quoted) throw new Error("Hay comillas sin cerrar en el CSV.");
  if (field || row.length || closed) flushRow();
  return rows;
}

export function parseProspectCsv(text: string): CsvParseResult {
  if (new TextEncoder().encode(text).length > MAX_BYTES) return { ok: false, error: "El archivo supera 256 KB." };
  let rows: string[][];
  try { rows = readRows(text.replace(/^\uFEFF/, "")); } catch (error) { return { ok: false, error: error instanceof Error ? error.message : "CSV inválido." }; }
  const headers = rows.shift()?.map((x) => x.trim().toLowerCase());
  if (!headers || new Set(headers).size !== headers.length || !["nombre", "telefono", "web"].every((h) => headers.includes(h))) return { ok: false, error: "El CSV necesita columnas únicas: nombre, telefono y web." };
  if (rows.length > MAX_ROWS) return { ok: false, error: "El archivo supera las 500 filas." };
  const index = (key: string) => headers.indexOf(key);
  return { ok: true, rows: rows.map((cells, idx) => {
    const errors: string[] = [];
    if (cells.length !== headers.length) errors.push("La cantidad de columnas no coincide con el encabezado.");
    const name = (cells[index("nombre")] ?? "").trim();
    if (!name) errors.push("Falta el nombre.");
    const rawPhone = (cells[index("telefono")] ?? "").trim();
    const normalized = rawPhone.replace(/[\s().-]/g, "");
    const phone_e164 = /^\+[1-9]\d{6,14}$/.test(normalized) ? normalized : null;
    if (!phone_e164) errors.push("Indicá el teléfono con código de país, por ejemplo +54.");
    const web = (cells[index("web")] ?? "").trim(); let website: string | null = null;
    if (web) { try { const url = new URL(web); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); website = url.href; } catch { errors.push("La web debe ser una URL http o https válida."); } }
    return { row: idx + 1, name, phone_e164, website, errors };
  }) };
}
