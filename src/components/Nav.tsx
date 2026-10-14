"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sun, Store, Map, ClipboardList, Route, BarChart3, Settings, LogOut, Ellipsis, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const MAIN = [
  { href: "/", label: "Hoy", icon: Sun },
  { href: "/map", label: "Mapa", icon: Map },
  { href: "/stores", label: "Tiendas", icon: Store },
  { href: "/visits", label: "Visitas", icon: ClipboardList },
];
const MORE = [
  { href: "/routes", label: "Rutas", icon: Route },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

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
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white p-3 md:flex">
        <div className="mb-5 px-3 pt-1 text-lg font-semibold tracking-tight">Mahou</div>
        <nav className="flex-1 space-y-1" aria-label="Principal">
          {desktop.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={clsx("flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm transition-colors", active(href) ? "bg-slate-900 font-medium text-white" : "text-slate-600 hover:bg-slate-100")}>
              <Icon size={18} /> {label}
              {href === "/" && unread > 0 && <span className="badge ml-auto bg-red-100 text-red-700">{unread}</span>}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="flex min-h-10 items-center gap-3 rounded-xl px-3 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut size={18} /> Salir
        </button>
      </aside>

      {more && (
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}
            className="absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(5rem+env(safe-area-inset-bottom))] shadow-card">
            <div className="mb-2 flex items-center justify-between"><span className="font-medium">Más</span><button aria-label="Cerrar" onClick={() => setMore(false)} className="p-2"><X size={18} /></button></div>
            {MORE.map(({ href, label, icon: Icon }) => (
              <Link key={href} href={href} className="flex min-h-12 items-center gap-3 rounded-xl px-3 text-base hover:bg-slate-100"><Icon size={20} /> {label}</Link>
            ))}
            <button onClick={logout} className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-base text-slate-600 hover:bg-slate-100"><LogOut size={20} /> Salir</button>
          </div>
        </div>
      )}

      <nav aria-label="Principal" className="fixed inset-x-0 bottom-0 z-50 flex border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        {MAIN.map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={clsx("relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-semibold text-slate-900" : "text-slate-500")}>
            <Icon size={22} strokeWidth={active(href) ? 2.4 : 1.8} /> {label}
            {href === "/" && unread > 0 && <span className="absolute right-[28%] top-1.5 h-2 w-2 rounded-full bg-red-600" />}
          </Link>
        ))}
        <button onClick={() => setMore(true)} aria-expanded={more}
          className={clsx("flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", moreActive || more ? "font-semibold text-slate-900" : "text-slate-500")}>
          <Ellipsis size={22} /> Más
        </button>
      </nav>
    </>
  );
}
