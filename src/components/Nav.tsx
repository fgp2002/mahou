"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sun, Store, Map, ClipboardList, Images, Route, BarChart3, Settings, LogOut, Ellipsis, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAIN = [
  { href: "/", label: "Hoy", icon: Sun },
  { href: "/map", label: "Mapa", icon: Map },
  { href: "/stores", label: "Tiendas", icon: Store },
  { href: "/visits", label: "Visitas", icon: ClipboardList },
];
const MORE = [
  { href: "/gallery", label: "Galería", icon: Images },
  { href: "/routes", label: "Rutas", icon: Route },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

/** Indicador discreto mientras la pantalla de destino se prepara. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={clsx("absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-current transition-opacity duration-150 xl:static xl:ml-auto", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}

export function Nav({ unread }: { unread: number }) {
  const path = usePathname();
  const router = useRouter();
  const [more, setMore] = useState(false);
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));
  const moreActive = MORE.some((m) => active(m.href));

  useEffect(() => setMore(false), [path]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const desktop = [...MAIN, ...MORE];
  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-[4.75rem] flex-col border-r border-slate-200 bg-white px-2 py-3 md:flex xl:w-56 xl:px-3">
        <div className="mb-4 px-1 text-center text-lg font-semibold tracking-tight xl:px-3 xl:text-left"><span className="xl:hidden">M</span><span className="hidden xl:inline">Mahou</span></div>
        <nav className="flex-1 space-y-1" aria-label="Principal">
          {desktop.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined} title={label}
              className={clsx("nav-item relative flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] xl:min-h-10 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-sm",
                active(href) ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100")}>
              <Icon size={20} className="shrink-0" /> <span>{label}</span>
              {href === "/" && unread > 0 && <span className="badge ml-auto hidden bg-red-100 text-red-700 xl:inline-flex">{unread}</span>}
              <Pending />
            </Link>
          ))}
        </nav>
        <button onClick={logout} title="Salir" className="nav-item flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl text-[11px] text-slate-600 hover:bg-slate-100 xl:min-h-10 xl:flex-row xl:justify-start xl:gap-3 xl:px-3 xl:text-sm">
          <LogOut size={20} /> <span>Salir</span>
        </button>
      </aside>

      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="fade-in absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}
            className="sheet-up absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-card">
            <div className="mb-2 flex items-center justify-between"><span className="font-medium">Más</span><button aria-label="Cerrar" onClick={() => setMore(false)} className="p-2"><X size={18} /></button></div>
            {MORE.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="nav-item flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-slate-100"><Icon size={20} /> {label}</Link>
            ))}
            <button onClick={logout} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base text-slate-600 hover:bg-slate-100"><LogOut size={20} /> Salir</button>
          </div>
        </div>
      )}

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MAIN.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={clsx("nav-item relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-semibold text-slate-900" : "text-slate-500")}>
            <Icon size={22} strokeWidth={active(href) ? 2.4 : 1.8} /> {label}
            {href === "/" && unread > 0 && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-red-600" />}
          </Link>
        ))}
        <button onClick={() => setMore(true)} aria-expanded={more}
          className={clsx("nav-item flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", moreActive || more ? "font-semibold text-slate-900" : "text-slate-500")}>
          <Ellipsis size={22} /> Más
        </button>
      </nav>
    </>
  );
}
