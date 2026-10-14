import Link from "next/link";
export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold">No encontrado</h1>
      <p className="text-sm text-slate-500">Esta página no existe o ya no está disponible.</p>
      <Link href="/" className="btn">Ir a Hoy</Link>
    </main>
  );
}
