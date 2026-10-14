"use client";
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="card mx-auto max-w-md space-y-3 text-center">
      <h2 className="text-lg font-semibold">Algo no ha ido bien</h2>
      <p className="text-sm text-slate-500">No se han podido cargar los datos. Tus cambios guardados están a salvo.</p>
      {error.digest && <p className="text-xs text-slate-400">Código: {error.digest}</p>}
      <button className="btn" onClick={reset}>Reintentar</button>
    </div>
  );
}
