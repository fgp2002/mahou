"use client";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Camera, CloudOff, Images, Plus } from "lucide-react";
import { kv } from "@/lib/offline/db";
import { addPaymentOffline, finishOfflineVisit, savePhotoOffline, type CachedBrand, type CachedType, type LocalVisit } from "@/lib/offline/visit";
import { eur } from "@/lib/format";

const fmt = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

/** Visita completa sin conexión: cronómetro, fotos, pagos y notas. Todo queda en el móvil hasta que vuelve la red. */
export function OfflineVisit() {
  const id = useSearchParams().get("id") ?? "";
  const [v, setV] = useState<LocalVisit | null>(null);
  const [types, setTypes] = useState<CachedType[]>([]);
  const [brands, setBrands] = useState<CachedBrand[]>([]);
  const [secs, setSecs] = useState(0);
  const [pay, setPay] = useState({ typeId: "", amount: "", brandId: "" });
  const [f, setF] = useState({ result: "", notes: "", incidents: "" });
  const [msg, setMsg] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    (async () => {
      setV((await kv.get<LocalVisit>(`visit:${id}`)) ?? null);
      setTypes(((await kv.get<CachedType[]>("types")) ?? []).filter((t) => t.active));
      setBrands((await kv.get<CachedBrand[]>("brands")) ?? []);
    })();
  }, [id]);
  useEffect(() => {
    if (!v || done) return;
    const t0 = new Date(v.startedAt).getTime();
    const tick = () => setSecs(Math.max(0, Math.floor((Date.now() - t0) / 1000)));
    tick();
    const i = setInterval(tick, 1000);
    return () => clearInterval(i);
  }, [v, done]);

  const save = async (nv: LocalVisit) => { setV(nv); await kv.set(`visit:${nv.id}`, nv); };

  async function photo(files: FileList | null) {
    if (!v || !files?.length) return;
    setBusy(true); setMsg(null);
    try {
      for (const file of Array.from(files)) await savePhotoOffline(v.id, file);
      await save({ ...v, photos: v.photos + files.length });
    } catch (e) { setMsg((e as Error).message); }
    setBusy(false);
  }
  async function addPay() {
    if (!v) return;
    const t = types.find((x) => x.id === pay.typeId);
    const amt = Number(pay.amount.replace(",", "."));
    if (!t || pay.amount.trim() === "" || !Number.isFinite(amt) || amt < 0) return setMsg("Elige el tipo y un importe válido.");
    await addPaymentOffline({ visitId: v.id, storeId: v.storeId, type: t, amount: amt, brand: brands.find((b) => b.id === pay.brandId) ?? null });
    await save({ ...v, payments: [...v.payments, { name: t.name + (pay.brandId ? ` · ${brands.find((b) => b.id === pay.brandId)?.name}` : ""), amount: amt }] });
    setPay({ typeId: "", amount: "", brandId: "" }); setMsg(null);
  }
  async function finish() {
    if (!v) return;
    setBusy(true);
    await finishOfflineVisit(v.id, v.startedAt, f);
    setBusy(false);
    setDone(true);
  }

  if (!id || v === null) {
    return <div className="card text-sm text-slate-600">No encuentro esta visita en el móvil. <a href="/" className="font-semibold text-brand-600 underline">Volver a Hoy</a></div>;
  }

  return (
    <>
      <div className="flex items-center gap-2 rounded-lg bg-amber-100 px-3 py-2 text-sm text-amber-800"><CloudOff size={16} /> Sin conexión: todo se guarda en el móvil y se enviará solo al recuperar la red.</div>
      <div className="card text-center">
        <div className="text-sm text-slate-500">{v.storeName}</div>
        {done ? <div className="my-2 text-xl font-bold">Visita guardada en el móvil ✓</div> : <div className="my-2 font-mono text-4xl">{fmt(secs)}</div>}
      </div>
      {done ? (
        <a href="/" className="btn w-full">Volver a Hoy</a>
      ) : (
        <>
          <section className="card space-y-3">
            <h2 className="font-semibold">Fotos ({v.photos})</h2>
            <div className="grid grid-cols-2 gap-2">
              <label className="btn-secondary cursor-pointer"><Camera size={16} /> Hacer foto<input type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => photo(e.target.files)} disabled={busy} /></label>
              <label className="btn-secondary cursor-pointer"><Images size={16} /> Galería<input type="file" accept="image/*" multiple className="hidden" onChange={(e) => photo(e.target.files)} disabled={busy} /></label>
            </div>
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Pagos</h2>
            {v.payments.length > 0 && <ul className="divide-y divide-slate-100 text-sm">{v.payments.map((p, i) => <li key={i} className="flex justify-between py-1.5"><span>{p.name}</span><b>{eur(p.amount)}</b></li>)}</ul>}
            {types.length === 0 ? <p className="text-xs text-slate-500">Abre la app una vez con conexión para tener los tipos de pago disponibles sin red.</p> : (
              <div className="grid grid-cols-2 gap-2">
                <select className="input col-span-2" value={pay.typeId} onChange={(e) => { const t = types.find((x) => x.id === e.target.value); setPay({ ...pay, typeId: e.target.value, amount: pay.amount || (t?.default_amount != null ? String(t.default_amount) : "") }); }} aria-label="Tipo de pago">
                  <option value="">Tipo de pago…</option>
                  {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                </select>
                <select className="input" value={pay.brandId} onChange={(e) => setPay({ ...pay, brandId: e.target.value })} aria-label="Marca">
                  <option value="">Sin marca</option>
                  {brands.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                <input className="input" inputMode="decimal" placeholder="Importe €" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: e.target.value })} />
                <button type="button" className="btn-secondary col-span-2" onClick={addPay}><Plus size={16} /> Añadir pago</button>
              </div>
            )}
          </section>
          <section className="card space-y-3">
            <h2 className="font-semibold">Notas</h2>
            {([["result", "Resultado"], ["incidents", "Incidencias"], ["notes", "Notas"]] as const).map(([k, l]) => (
              <div key={k}><label className="label">{l}</label><textarea className="input" rows={2} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></div>
            ))}
          </section>
          {msg && <p className="text-sm text-red-600">{msg}</p>}
          <button className="btn w-full" disabled={busy} onClick={finish}>Finalizar visita</button>
        </>
      )}
    </>
  );
}
