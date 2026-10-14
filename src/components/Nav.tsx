"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sun, Store, Map, ClipboardList, Images, Route, BarChart3, Settings, LogOut, Ellipsis, X, Plus } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const DESKTOP = [
  { href: "/", label: "Hoy", icon: Sun },
  { href: "/map", label: "Mapa", icon: Map },
  { href: "/stores", label: "Tiendas", icon: Store },
  { href: "/visits", label: "Visitas", icon: ClipboardList },
  { href: "/gallery", label: "Galería", icon: Images },
  { href: "/routes", label: "Rutas", icon: Route },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];
const LEFT = DESKTOP.slice(0, 2);
const RIGHT = [DESKTOP[2]];
const MORE = DESKTOP.slice(3);

/** Indicador discreto mientras la pantalla de destino se prepara. */
function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={clsx("ml-auto h-1.5 w-1.5 rounded-full bg-current transition-opacity duration-150", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}

type Ico = typeof Sun;
/** Icono de línea que se rellena al activarse. */
function Icon({ icon: I, on, size = 22 }: { icon: Ico; on: boolean; size?: number }) {
  return <I size={size} strokeWidth={on ? 2.2 : 1.8} fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.18 : 0} className="shrink-0" />;
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

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-56 flex-col border-r border-slate-200 bg-white px-3 py-4 md:flex">
        <div className="mb-5 px-3 text-xl font-bold tracking-tight">Mahou</div>
        <nav className="flex-1 space-y-1" aria-label="Principal">
          {DESKTOP.map(({ href, label, icon }) => (
            <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
              className={clsx("nav-item flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm",
                active(href) ? "bg-slate-900 font-semibold text-[rgb(var(--on-accent))]" : "text-slate-600 hover:bg-slate-100")}>
              <Icon icon={icon} on={active(href)} size={20} /> <span>{label}</span>
              {href === "/" && unread > 0 && <span className="badge ml-auto bg-red-100 text-red-700">{unread}</span>}
              <Pending />
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="nav-item flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut size={20} /> <span>Salir</span>
        </button>
      </aside>

      {more && (
        <div className="fixed inset-0 z-[55] md:hidden" onClick={() => setMore(false)}>
          <div className="fade-in absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}
            className="sheet-up absolute inset-x-0 bottom-0 rounded-t-[2rem] bg-white p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-card">
            <div className="mb-2 flex items-center justify-between"><span className="font-semibold">Más</span><button aria-label="Cerrar" onClick={() => setMore(false)} className="p-2"><X size={18} /></button></div>
            {MORE.map(({ href, label, icon }) => (
              <Link key={href} href={href} className="nav-item flex min-h-12 items-center gap-3 rounded-2xl px-3 text-base hover:bg-slate-100"><Icon icon={icon} on={active(href)} size={20} /> {label}</Link>
            ))}
            <button onClick={logout} className="flex min-h-12 w-full items-center gap-3 rounded-2xl px-3 text-base text-slate-600 hover:bg-slate-100"><LogOut size={20} /> Salir</button>
          </div>
        </div>
      )}

      <nav aria-label="Principal" className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center rounded-full border border-slate-200 bg-white/90 px-2 shadow-[0_8px_30px_rgb(0_0_0/0.18)] backdrop-blur-xl md:hidden">
        {LEFT.map(({ href, label, icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={clsx("nav-item relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-semibold text-slate-900" : "text-slate-500")}>
            <Icon icon={icon} on={active(href)} /> {label}
            {href === "/" && unread > 0 && <span className="absolute right-[26%] top-2.5 h-2 w-2 rounded-full bg-red-600" />}
          </Link>
        ))}
        <Link href="/visits/new" aria-label="Iniciar visita" className="nav-item mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-slate-900 text-[rgb(var(--on-accent))] shadow-[0_6px_18px_rgb(0_0_0/0.35)]">
          <Plus size={28} strokeWidth={2.4} />
        </Link>
        {RIGHT.map(({ href, label, icon }) => (
          <Link key={href} href={href} aria-current={active(href) ? "page" : undefined}
            className={clsx("nav-item flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", active(href) ? "font-semibold text-slate-900" : "text-slate-500")}>
            <Icon icon={icon} on={active(href)} /> {label}
          </Link>
        ))}
        <button onClick={() => setMore(true)} aria-expanded={more}
          className={clsx("nav-item flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", moreActive || more ? "font-semibold text-slate-900" : "text-slate-500")}>
          <Ellipsis size={22} /> Más
        </button>
      </nav>
    </>
  );
}
