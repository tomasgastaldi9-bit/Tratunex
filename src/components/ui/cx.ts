/**
 * Junta clases de Tailwind en un solo texto, salteando las vacías.
 *
 * Ejemplo: cx("p-5", activo && "bg-ink", undefined) → "p-5 bg-ink" (si activo es true).
 *
 * Ojo: si pasás una clase que "pelea" con otra (por ejemplo p-5 y p-2), no
 * gana necesariamente la última. Para cambiar el relleno de un componente,
 * usá sus props en lugar de pisar la clase.
 */
export function cx(...clases: Array<string | false | null | undefined>): string {
  return clases.filter(Boolean).join(" ");
}
