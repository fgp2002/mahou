"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";
import { Field } from "@/components/Field";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) {
      setError("Correo o contraseña incorrectos.");
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="scroll-root">
      <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-8 px-5 py-10">
        <div className="page-in flex flex-col items-center gap-3 text-center">
          <span className="flex h-20 w-20 items-center justify-center rounded-[1.75rem] bg-slate-900 text-4xl font-extrabold text-[rgb(var(--on-accent))] shadow-[0_12px_30px_rgb(0_0_0/0.25)]">M</span>
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Mahou</h1>
            <p className="text-sm text-slate-500">Tus visitas, rutas y tiendas en un sitio.</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="card page-in space-y-3">
          <Field label="Correo" type="email" autoComplete="email" required value={email} onChange={setEmail} />
          <Field label="Contraseña" type="password" autoComplete="current-password" required value={password} onChange={setPassword} />
          {error && <p className="text-sm text-red-600" role="alert">{error}</p>}
          <button className="btn w-full !min-h-12 text-base" disabled={busy}>{busy ? "Entrando…" : "Entrar"}</button>
        </form>
      </main>
    </div>
  );
}
