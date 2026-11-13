"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { MahouLogo } from "./MahouLogo";
import { ScrollLock } from "@/lib/useScrollLock";
import { Sun, Store, Map, ClipboardList, Route, BarChart3, Settings, LogOut, Ellipsis, X, Plus, Wallet } from "lucide-react";
import { safeLogout } from "@/lib/offline/logout";

type Ico = typeof Sun;
interface Item { href: string; label: string }
interface Group { label: string; icon: Ico; href?: string; items?: Item[] }

const GROUPS: Group[] = [
  { label: "Hoy", icon: Sun, href: "/" },
  { label: "Planificación", icon: Route, items: [{ href: "/map", label: "Mapa" }, { href: "/routes", label: "Rutas" }] },
  { label: "Tiendas", icon: Store, items: [{ href: "/stores", label: "Listado" }, { href: "/inventory", label: "Inventario" }, { href: "/stores/new", label: "Nueva tienda" }] },
  { label: "Visitas", icon: ClipboardList, items: [{ href: "/visits", label: "Historial" }, { href: "/visits/new", label: "Nueva visita" }, { href: "/incidents", label: "Incidencias" }, { href: "/gallery", label: "Galería" }] },
  { label: "Economía", icon: Wallet, items: [{ href: "/economy", label: "Resumen" }, { href: "/agreements", label: "Acuerdos" }] },
  { label: "Informes", icon: BarChart3, items: [{ href: "/reports", label: "Informe de actividad" }] },
  { label: "Ajustes", icon: Settings, items: [{ href: "/settings?tab=jornada", label: "Jornada" }, { href: "/settings?tab=catalogo", label: "Catálogo" }, { href: "/settings?tab=papelera", label: "Papelera" }, { href: "/settings?tab=app", label: "App y cuenta" }] },
];

const MOBILE_LEFT = [{ href: "/", label: "Hoy", icon: Sun }, { href: "/map", label: "Mapa", icon: Map }];
const MOBILE_RIGHT = [{ href: "/stores", label: "Tiendas", icon: Store }];

function Pending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={clsx("ml-auto h-1.5 w-1.5 shrink-0 rounded-full bg-current transition-opacity duration-150", pending ? "animate-pulse opacity-100" : "opacity-0")} />;
}

function useActive() {
  const path = usePathname();
  const sp = useSearchParams();
  return (href: string) => {
    const [p, q] = href.split("?");
    if (p === "/") return path === "/";
    if (q) {
      const want = new URLSearchParams(q).get("tab");
      return path.startsWith(p) && (sp.get("tab") ?? "jornada") === want;
    }
    if (p === "/stores") return path.startsWith("/stores") && path !== "/stores/new";
    if (p === "/visits") return path.startsWith("/visits") && path !== "/visits/new";
    return path === p || path.startsWith(p + "/");
  };
}

export function Nav({ unread }: { unread: number }) {
  const path = usePathname();
  const router = useRouter();
  const isActive = useActive();
  const [more, setMore] = useState(false);
  const groupActive = (g: Group) => (g.href ? isActive(g.href) : (g.items ?? []).some((i) => isActive(i.href)));

  useEffect(() => setMore(false), [path]);

  async function logout() {
    // Antes de salir se intenta enviar lo pendiente; lo que no se pueda enviar se queda guardado en el móvil.
    if (!(await safeLogout())) return;
    router.replace("/login");
    router.refresh();
  }

  const moreActive = !["/", "/map"].includes(path) && !path.startsWith("/stores");

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-slate-200 bg-white lg:flex">
        <Link href="/" aria-label="Mahou · Inicio" className="flex h-[4.5rem] shrink-0 items-center bg-brand-600 px-6">
          <MahouLogo height={30} tone="white" />
        </Link>
        <nav className="flex-1 overflow-y-auto px-3 py-4" aria-label="Principal">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const act = groupActive(g);
            if (g.href) {
              return (
                <Link key={g.label} href={g.href} aria-current={act ? "page" : undefined}
                  className={clsx("nav-item relative mb-3 flex h-11 items-center gap-3 rounded-xl px-3 text-sm font-semibold", act ? "bg-brand-50 text-brand-700" : "text-slate-700 hover:bg-slate-100 hover:text-slate-900")}>
                  {act && <span aria-hidden className="absolute -left-3 top-2 h-7 w-1 rounded-r-full bg-brand-600" />}
                  <Icon size={19} strokeWidth={act ? 2.3 : 1.9} className="shrink-0" /> <span>{g.label}</span>
                  {g.href === "/" && unread > 0 && <span className="badge ml-auto bg-brand-600 text-[rgb(var(--on-accent))]">{unread}</span>}
                  <Pending />
                </Link>
              );
            }
            return (
              <div key={g.label} className="mb-3">
                <div className="flex items-center gap-2 px-3 pb-1 pt-1 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">
                  <Icon size={14} strokeWidth={2.2} className={clsx("shrink-0", act && "text-brand-600")} /> {g.label}
                </div>
                <ul className="space-y-0.5">
                  {(g.items ?? []).map((i) => {
                    const on = isActive(i.href);
                    return (
                      <li key={i.href}>
                        <Link href={i.href} aria-current={on ? "page" : undefined}
                          className={clsx("nav-item relative flex h-10 items-center rounded-xl px-3 text-sm", on ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                          {on && <span aria-hidden className="absolute -left-3 top-1.5 h-7 w-1 rounded-r-full bg-brand-600" />}
                          {i.label}
                          <Pending />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button onClick={logout} className="nav-item flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={18} /> <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {more && (
        <div className="fixed inset-0 z-[55] lg:hidden" onClick={() => setMore(false)}>
          <ScrollLock />
          <div className="fade-in absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}
            className="sheet-up absolute inset-x-0 bottom-0 mx-auto max-h-[85dvh] max-w-xl overflow-y-auto overscroll-contain rounded-t-[1.75rem] bg-white p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-pop">
            <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-slate-200" aria-hidden />
            <div className="mb-1 flex items-center justify-between px-1"><MahouLogo height={24} /><button aria-label="Cerrar" onClick={() => setMore(false)} className="tap flex h-10 w-10 items-center justify-center rounded-full bg-slate-100"><X size={18} /></button></div>
            {GROUPS.filter((g) => g.items).map((g) => (
              <div key={g.label} className="py-1.5">
                <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase tracking-[0.1em] text-slate-400">{g.label}</div>
                {(g.items ?? []).map((i) => (
                  <Link key={i.href} href={i.href} className={clsx("nav-item flex min-h-12 items-center rounded-xl px-3 text-[15px]", isActive(i.href) ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-100")}>{i.label}</Link>
                ))}
              </div>
            ))}
            <button onClick={logout} className="mt-2 flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-[15px] text-slate-600 hover:bg-slate-100"><LogOut size={18} /> Cerrar sesión</button>
          </div>
        </div>
      )}

      <nav aria-label="Principal" className="fixed inset-x-3 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center rounded-[1.75rem] border border-slate-200 bg-white/95 px-1.5 shadow-pop backdrop-blur-xl lg:hidden">
        {MOBILE_LEFT.map(({ href, label, icon: I }) => {
          const on = isActive(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={clsx("nav-item relative flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", on ? "font-semibold text-brand-600" : "text-slate-500")}>
              <I size={22} strokeWidth={on ? 2.2 : 1.8} fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.15 : 0} /> {label}
              {href === "/" && unread > 0 && <span className="absolute right-[26%] top-2.5 h-2 w-2 rounded-full bg-st-late" />}
            </Link>
          );
        })}
        <Link href="/visits/new" aria-label="Iniciar visita" className="nav-item mx-1 -mt-7 flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-brand-600 text-[rgb(var(--on-accent))] shadow-brand ring-4 ring-slate-50">
          <Plus size={28} strokeWidth={2.4} />
        </Link>
        {MOBILE_RIGHT.map(({ href, label, icon: I }) => {
          const on = isActive(href);
          return (
            <Link key={href} href={href} aria-current={on ? "page" : undefined}
              className={clsx("nav-item flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", on ? "font-semibold text-brand-600" : "text-slate-500")}>
              <I size={22} strokeWidth={on ? 2.2 : 1.8} fill={on ? "currentColor" : "none"} fillOpacity={on ? 0.15 : 0} /> {label}
            </Link>
          );
        })}
        <button onClick={() => setMore(true)} aria-expanded={more}
          className={clsx("nav-item flex min-h-16 flex-1 flex-col items-center justify-center gap-0.5 text-[11px]", moreActive || more ? "font-semibold text-brand-600" : "text-slate-500")}>
          <Ellipsis size={22} /> Más
        </button>
      </nav>
    </>
  );
}
