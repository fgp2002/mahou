"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

interface Summary { total: number; valid: number; inserted: number; updated: number; unchanged: number; duplicatesInFile: number; errors: number }
interface Result { dryRun: boolean; summary: Summary; errors: { row: number; error: string }[]; error?: string }

const cell = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

export function ImportPanel() {
  const router = useRouter();
  const [rows, setRows] = useState<Record<string, unknown>[] | null>(null);
  const [name, setName] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function post(dryRun: boolean, data = rows, filename = name) {
    setBusy(true);
    setErr(null);
    const r = await fetch("/api/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ rows: data, dryRun, filename }) });
    const j = (await r.json()) as Result;
    setBusy(false);
    if (!r.ok) return setErr(j.error ?? "Error en la importación");
    setRes(j);
    if (!dryRun) router.refresh();
  }

  async function onFile(f: File | undefined) {
    if (!f) return;
    setRes(null);
    setErr(null);
    try {
      const { default: readXlsxFile, readSheetNames } = await import("read-excel-file");
      const names = await readSheetNames(f);
      let table: unknown[][] | null = null;
      for (const sheet of names) {
        const t = (await readXlsxFile(f, { sheet })) as unknown[][];
        if (t[0]?.map((c) => String(c).trim().toLowerCase()).includes("idpdv")) { table = t; break; }
      }
      if (!table) throw new Error("No encuentro una hoja con la columna «IdPdV».");
      const head = table[0].map((c) => String(c).trim());
      const col = (n: string) => head.findIndex((h) => h.toLowerCase() === n.toLowerCase());
      const idx = { id: col("IdPdV"), name: col("Punto de venta"), gpv: col("GPV"), per: col("Periodicidad"), audit: col("Audit"), area: col("Área"), type: col("Tipo tienda MSM"), kam: col("KAM"), macro: col("Macrocadena Nielsen"), chain: col("Cadena Nielsen"), banner: col("Rótulo"), addr: col("Dirección"), town: col("Población"), cp: col("Cód.Postal"), prov: col("Provincia"), niel: col("Cód. Nielsen"), est: col("Estado") };
      const g = (r: unknown[], i: number) => (i < 0 ? null : cell(r[i]));
      const data = table.slice(1).filter((r) => r.some((c) => c !== null && c !== "")).map((r) => {
        const per = (g(r, idx.per) ?? "").toLowerCase();
        const est = g(r, idx.est);
        return {
          source_id: g(r, idx.id) ?? "", name: g(r, idx.name) ?? "", gpv: g(r, idx.gpv), area: g(r, idx.area), store_type: g(r, idx.type), kam: g(r, idx.kam),
          macro_chain: g(r, idx.macro), chain: g(r, idx.chain), banner: g(r, idx.banner), address: g(r, idx.addr), town: g(r, idx.town),
          postal_code: g(r, idx.cp), province: g(r, idx.prov), nielsen_code: g(r, idx.niel),
          frequency: ["semanal", "quincenal", "mensual", "ninguna"].includes(per) ? per : undefined,
          audit: ["1", "true", "si", "sí"].includes((g(r, idx.audit) ?? "").toLowerCase()) ,
          active: est ? est.toUpperCase() === "ALTA" : undefined,
        };
      });
      setRows(data);
      setName(f.name);
      await post(true, data, f.name);
    } catch (e) {
      setErr("No se pudo leer el Excel: " + (e as Error).message);
    }
  }

  return (
    <section className="card space-y-3">
      <h2 className="font-medium">Importar Excel de puntos de venta</h2>
      <p className="text-sm text-slate-500">Se conservan los IDs originales. Si un ID ya existe se actualiza (salvo los campos que hayas editado a mano). Antes de guardar verás una vista previa.</p>
      <input type="file" accept=".xlsx" onChange={(e) => onFile(e.target.files?.[0])} />
      {err && <p className="text-sm text-red-600">{err}</p>}
      {res && (
        <div className="rounded-lg bg-slate-50 p-3 text-sm">
          <b>{res.dryRun ? "Vista previa (aún no guardado)" : "Importación terminada"}</b>
          <ul className="mt-1 list-inside list-disc">
            <li>Filas leídas: {res.summary.total} · válidas: {res.summary.valid}</li>
            <li>Nuevas: {res.summary.inserted} · Actualizadas: {res.summary.updated} · Sin cambios: {res.summary.unchanged}</li>
            <li>Duplicadas en el archivo (ignoradas): {res.summary.duplicatesInFile} · Con error: {res.summary.errors}</li>
          </ul>
          {res.errors.length > 0 && <ul className="mt-1 text-red-600">{res.errors.slice(0, 10).map((e, i) => <li key={i}>Fila {e.row}: {e.error}</li>)}</ul>}
          {res.dryRun && <button className="btn mt-2" disabled={busy} onClick={() => post(false)}>Confirmar importación</button>}
        </div>
      )}
    </section>
  );
}
