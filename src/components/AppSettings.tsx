"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import clsx from "clsx";
import { LogOut, Monitor, Moon, Sun } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Field } from "./Field";
import { toast } from "./Toast";

type Theme = "auto" | "light" | "dark";
const KEY = "mahou-theme";

function applyTheme(t: Theme) {
  const el = document.documentElement;
  if (t === "auto") el.removeAttribute("data-theme"); else el.setAttribute("data-theme", t);
}

export function ThemeSwitch() {
  const [t, setT] = useState<Theme>("auto");
  useEffect(() => {
    try { const v = localStorage.getItem(KEY); if (v === "light" || v === "dark") setT(v); } catch { /* sin almacenamiento */ }
  }, []);
  function choose(v: Theme) {
    setT(v);
    applyTheme(v);
    try { if (v === "auto") localStorage.removeItem(KEY); else localStorage.setItem(KEY, v); } catch { /* sin almacenamiento */ }
  }
  const opts: [Theme, string, typeof Sun][] = [["auto", "Automático", Monitor], ["light", "Claro", Sun], ["dark", "Oscuro", Moon]];
  return (
    <section className="card space-y-3">
      <div>
        <h2 className="font-semibold">Apariencia</h2>
        <p className="text-xs text-slate-500">Automático sigue el modo claro u oscuro de tu dispositivo. Se guarda en este dispositivo.</p>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {opts.map(([v, l, I]) => (
          <button key={v} type="button" onClick={() => choose(v)} aria-pressed={t === v}
            className={clsx("tap flex flex-col items-center gap-1.5 rounded-2xl border p-3 text-sm", t === v ? "border-slate-900 bg-slate-900 font-semibold text-[rgb(var(--on-accent))]" : "border-slate-200 text-slate-600")}>
            <I size={20} /> {l}
          </button>
        ))}
      </div>
    </section>
  );
}

export function AccountPanel({ email }: { email: string }) {
  const router = useRouter();
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function change() {
    setErr(null);
    if (pw.length < 8) return setErr("La contraseña debe tener al menos 8 caracteres.");
    if (pw !== pw2) return setErr("Las contraseñas no coinciden.");
    setBusy(true);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setErr(error.message);
    setPw(""); setPw2("");
    toast("Contraseña cambiada");
  }

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <section className="card space-y-4">
      <div className="flex items-center gap-3">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-900 text-lg font-bold uppercase text-[rgb(var(--on-accent))]">{email.slice(0, 1)}</span>
        <div className="min-w-0"><h2 className="font-semibold">Cuenta</h2><p className="truncate text-sm text-slate-500">{email}</p></div>
      </div>
      <div className="space-y-2">
        <div className="label">Cambiar contraseña</div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Nueva contraseña" type="password" autoComplete="new-password" value={pw} onChange={setPw} />
          <Field label="Repetir contraseña" type="password" autoComplete="new-password" value={pw2} onChange={setPw2} />
        </div>
        {err && <p className="text-sm text-red-600" role="alert">{err}</p>}
        <button className="btn-secondary" onClick={change} disabled={busy || !pw}>{busy ? "Guardando…" : "Cambiar contraseña"}</button>
      </div>
      <button className="btn-secondary w-full !text-red-600" onClick={logout}><LogOut size={16} /> Cerrar sesión</button>
    </section>
  );
}
