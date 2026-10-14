export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Cargando" className="space-y-4">
      <div className="skeleton h-4 w-32" />
      <div className="skeleton h-9 w-56" />
      <div className="skeleton h-36 !rounded-xl" />
      <div className="space-y-2.5">
        {[0, 1, 2, 3, 4].map((i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-2.5">
            <div className="skeleton h-12 w-12 !rounded-full" />
            <div className="flex-1 space-y-2"><div className="skeleton h-3.5 w-2/3" /><div className="skeleton h-3 w-1/3" /></div>
          </div>
        ))}
      </div>
    </div>
  );
}
