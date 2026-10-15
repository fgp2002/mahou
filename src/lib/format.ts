// Formatos compartidos (euros, fechas, meses). Un único sitio para no repetirlos en cada pantalla.
export const eur = (n: number) => n.toLocaleString("es-ES", { style: "currency", currency: "EUR" });
/** AAAA-MM-DD → DD/MM/AAAA */
export const dmy = (d: string | null | undefined) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");
export const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
