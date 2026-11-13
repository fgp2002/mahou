// Filtros de tiendas compartidos entre la lista y el mapa: misma URL y se recuerdan en este dispositivo.
export const FILTER_KEYS = ["q", "state", "town", "banner", "chain", "type", "freq", "audit"] as const;
const LS = "mahou.storeFilters";

/** Solo las claves de filtro de una URL (sin página ni orden). */
export function filterQuery(sp: URLSearchParams): string {
  const u = new URLSearchParams();
  for (const k of FILTER_KEYS) for (const v of sp.getAll(k)) if (v) u.append(k, v);
  return u.toString();
}
export function saveFilters(qs: string) {
  try { localStorage.setItem(LS, qs); } catch { /* sin almacenamiento: no pasa nada */ }
}
export function loadFilters(): string {
  try { return localStorage.getItem(LS) ?? ""; } catch { return ""; }
}
