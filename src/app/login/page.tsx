"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { MahouLogo, MahouEmblem } from "@/components/MahouLogo";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      // Se conserva lo escrito: solo se marca el error.
      setError(navigator.onLine === false ? "Sin conexión. Inténtalo de nuevo cuando tengas cobertura." : "Correo o contraseña incorrectos.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="scroll-root bg-slate-50">
      <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Marca: banda roja en el móvil, mitad de la pantalla en escritorio */}
        <section className="relative flex flex-col justify-end overflow-hidden bg-brand-600 px-6 pb-16 pt-[max(2.5rem,env(safe-area-inset-top))] text-[#fff] lg:justify-between lg:px-14 lg:pb-14 lg:pt-14">
          <MahouEmblem size={360} tone="white" className="pointer-events-none absolute -right-20 -top-16 opacity-[0.07] lg:-bottom-24 lg:-right-24 lg:top-auto lg:h-[520px] lg:w-[520px]" />
          <MahouLogo height={44} tone="white" className="relative lg:h-[56px]" />
          <div className="relative mt-8 max-w-md lg:mt-0">
            <p className="text-[1.65rem] font-extrabold leading-tight tracking-[-0.02em] lg:text-[2.6rem]">Gestión del punto de venta</p>
            <p className="mt-2 text-sm text-[#fff]/85 lg:mt-4 lg:text-base">Visitas, rutas, tiendas, inventario e inversión en un solo sitio.</p>
          </div>
          <p className="relative mt-6 hidden text-xs text-[#fff]/70 lg:block">Canal alimentación · Uso interno</p>
        </section>

        <main className="relative -mt-8 flex justify-center px-4 pb-[max(2rem,env(safe-area-inset-bottom))] lg:mt-0 lg:items-center lg:px-10">
          <form onSubmit={onSubmit} noValidate={false} aria-busy={busy} className="card page-in w-full max-w-md space-y-4 self-start !p-6 shadow-pop lg:self-center lg:!p-8 lg:shadow-card">
            <div>
              <h1 className="t-page">Entrar</h1>
              <p className="mt-1 text-sm text-slate-500">Con tu correo y contraseña.</p>
            </div>
            <div>
              <label htmlFor="email" className="label">Correo <span className="text-brand-600" aria-hidden>*</span></label>
              <input id="email" className="input !min-h-12 text-base" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} enterKeyHint="next" required
                value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "login-err" : undefined} />
            </div>
            <div>
              <label htmlFor="password" className="label">Contraseña <span className="text-brand-600" aria-hidden>*</span></label>
              <div className="relative">
                <input id="password" className="input !min-h-12 !pr-12 text-base" type={show ? "text" : "password"} autoComplete="current-password" enterKeyHint="go" required
                  value={password} onChange={(e) => setPassword(e.target.value)} aria-invalid={error ? true : undefined} aria-describedby={error ? "login-err" : undefined} />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"} aria-pressed={show}
                  className="absolute right-1 top-1/2 flex h-10 w-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
                  {show ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </div>
            {error && <p id="login-err" className="rounded-xl bg-red-100 px-3 py-2 text-sm font-medium text-red-700" role="alert">{error}</p>}
            <button type="submit" className="btn w-full !min-h-12 text-base" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
          </form>
        </main>
      </div>
    </div>
  );
}
