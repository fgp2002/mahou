"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MahouLogo } from "@/components/MahouLogo";

type Stage = "checking" | "ready" | "invalid" | "done";

/** Pantalla a la que llega el enlace del correo: valida el enlace y permite poner una contraseña nueva. */
export default function ResetPasswordPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [why, setWhy] = useState("");
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sb = supabaseBrowser();
    (async () => {
      const url = new URL(window.location.href);
      const hash = new URLSearchParams(url.hash.slice(1));
      const err = url.searchParams.get("error_description") ?? hash.get("error_description");
      if (err) { setWhy(/expired|invalid/i.test(err) ? "El enlace ha caducado o ya se usó." : err); return setStage("invalid"); }
      // El cliente de Supabase canjea solo el código del enlace (?code=… o #access_token=…) al arrancar:
      // aquí solo se espera a que termine y se mira el resultado.
      const hadLink = url.searchParams.has("code") || hash.has("access_token");
      const { error } = await sb.auth.initialize();
      if (hadLink) window.history.replaceState(null, "", "/auth/reset");
      if (error) { setWhy(/verifier/i.test(error.message) ? "Abre el enlace en el mismo móvil o navegador en el que lo pediste." : "El enlace ha caducado o ya se usó."); return setStage("invalid"); }
      const { data } = await sb.auth.getSession();
      if (data.session) return setStage("ready");
      setWhy("Este enlace no es válido.");
      setStage("invalid");
    })();
  }, []);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = pw2.length > 0 && pw !== pw2;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (pw.length < 8) return setError("La contraseña debe tener al menos 8 caracteres.");
    if (pw !== pw2) return setError("Las dos contraseñas no coinciden.");
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(/different|same/i.test(error.message) ? "La nueva contraseña debe ser distinta de la anterior." : /weak|short|characters/i.test(error.message) ? "Esa contraseña es demasiado débil. Prueba con una más larga." : "No se pudo guardar. Inténtalo de nuevo.");
    setStage("done");
    setTimeout(() => { router.replace("/"); router.refresh(); }, 1500);
  }

  return (
    <div className="scroll-root bg-slate-50">
      <header className="flex h-[4.5rem] items-center justify-center bg-brand-600 pt-[env(safe-area-inset-top)]"><MahouLogo height={30} tone="white" /></header>
      <main className="mx-auto flex w-full max-w-md flex-col px-4 py-8 pb-[max(2rem,env(safe-area-inset-bottom))]">
        {stage === "checking" && <div className="card text-sm text-slate-500" role="status">Comprobando el enlace…</div>}
        {stage === "invalid" && (
          <div className="card space-y-4" role="alert">
            <h1 className="t-page">No se puede usar este enlace</h1>
            <p className="text-sm text-slate-600">{why} Pide uno nuevo desde la pantalla de acceso.</p>
            <Link href="/login" className="btn w-full !min-h-12 text-base">Ir a la pantalla de acceso</Link>
          </div>
        )}
        {stage === "done" && (
          <div className="card space-y-2" role="status">
            <h1 className="t-page">Contraseña cambiada</h1>
            <p className="text-sm text-slate-600">Ya puedes usar la nueva contraseña. Entrando…</p>
          </div>
        )}
        {stage === "ready" && (
          <form onSubmit={save} aria-busy={busy} className="card space-y-4 !p-6">
            <div>
              <h1 className="t-page">Nueva contraseña</h1>
              <p className="mt-1 text-sm text-slate-500">Mínimo 8 caracteres.</p>
            </div>
            <div>
              <label htmlFor="pw" className="label">Contraseña nueva <span className="text-brand-600" aria-hidden>*</span></label>
              <div className="relative">
                <input id="pw" className="input !min-h-12 !pr-12 text-base" type={show ? "text" : "password"} autoComplete="new-password" enterKeyHint="next" required minLength={8} autoFocus
                  value={pw} onChange={(e) => setPw(e.target.value)} aria-invalid={tooShort || undefined} aria-describedby="pw-help" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">{show ? <EyeOff size={18} /> : <Eye size={18} />}</button>
              </div>
              <p id="pw-help" className={tooShort ? "field-error" : "mt-1 text-xs text-slate-500"}>{tooShort ? `Faltan ${8 - pw.length} caracteres.` : "Usa al menos 8 caracteres."}</p>
            </div>
            <div>
              <label htmlFor="pw2" className="label">Repite la contraseña <span className="text-brand-600" aria-hidden>*</span></label>
              <input id="pw2" className="input !min-h-12 text-base" type={show ? "text" : "password"} autoComplete="new-password" enterKeyHint="done" required
                value={pw2} onChange={(e) => setPw2(e.target.value)} aria-invalid={mismatch || undefined} aria-describedby={mismatch ? "pw2-err" : undefined} />
              {mismatch && <p id="pw2-err" className="field-error">No coincide con la anterior.</p>}
            </div>
            {error && <p className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
            <button type="submit" className="btn w-full !min-h-12 text-base" disabled={busy}>{busy ? "Guardando…" : "Guardar contraseña"}</button>
          </form>
        )}
      </main>
    </div>
  );
}
