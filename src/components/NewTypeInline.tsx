"use client";
import { useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { createPaymentType, type PaymentType } from "@/lib/payments";

/** Mini formulario para crear un tipo de pago sin salir del flujo actual. */
export function NewTypeInline({ onCreated, onCancel }: { onCreated: (t: PaymentType) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    const amt = amount.trim() === "" ? null : Number(amount.replace(",", "."));
    const { data, error } = await createPaymentType(supabaseBrowser(), { name, default_amount: amt });
    setBusy(false);
    if (error || !data) return setErr(error);
    onCreated(data);
  }
  return (
    <div className="space-y-2 rounded-xl bg-slate-100 p-3">
      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2 sm:col-span-1"><label className="label">Nombre del nuevo tipo</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} autoFocus /></div>
        <div className="col-span-2 sm:col-span-1"><label className="label">Importe predeterminado (€, opcional)</label><input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} /></div>
      </div>
      {err && <p className="text-sm text-red-600">{err}</p>}
      <div className="flex gap-2"><button type="button" className="btn" disabled={busy} onClick={create}>Crear tipo</button><button type="button" className="btn-secondary" onClick={onCancel}>Cancelar</button></div>
    </div>
  );
}
