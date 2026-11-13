// CSV para Excel en español: separador «;», BOM para los acentos y protección contra fórmulas inyectadas.
export function csvCell(v: unknown): string {
  let s = v == null ? "" : typeof v === "number" ? String(v).replace(".", ",") : String(v);
  if (typeof v === "string" && /^[=+\-@]/.test(s)) s = "'" + s;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(header: string[], rows: unknown[][]): string {
  return "﻿" + [header.map(csvCell).join(";"), ...rows.map((r) => r.map(csvCell).join(";"))].join("\r\n");
}

export function csvResponse(name: string, header: string[], rows: unknown[][]) {
  return new Response(toCsv(header, rows), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}.csv"`, "Cache-Control": "no-store" },
  });
}
