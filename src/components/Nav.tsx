"use client";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import clsx from "clsx";
import { Sun, Store, Map, ClipboardList, Route, BarChart3, Settings, LogOut, Ellipsis, X, Plus, ChevronDown, Wallet } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";
import { clearOfflineData } from "@/lib/offline/db";

type Ico = typeof Sun;
interface Item { href: string; label: string }
interface Group { label: string; icon: Ico; href?: string; items?: Item[] }

const GROUPS: Group[] = [
  { label: "Hoy", icon: Sun, href: "/" },
  { label: "Planificación", icon: Route, items: [{ href: "/map", label: "Mapa" }, { href: "/routes", label: "Rutas" }] },
  { label: "Tiendas", icon: Store, items: [{ href: "/stores", label: "Listado" }, { href: "/stores/new", label: "Nueva tienda" }] },
  { label: "Visitas", icon: ClipboardList, items: [{ href: "/visits", label: "Historial" }, { href: "/visits/new", label: "Nueva visita" }, { href: "/gallery", label: "Galería" }] },
  { label: "Pagos", icon: Wallet, items: [{ href: "/payments", label: "Desglose por tipo" }] },
  { label: "Informes", icon: BarChart3, items: [{ href: "/stats", label: "Estadísticas" }] },
  { label: "Ajustes", icon: Settings, items: [{ href: "/settings?tab=jornada", label: "Jornada" }, { href: "/settings?tab=catalogo", label: "Catálogo" }, { href: "/settings?tab=app", label: "App y cuenta" }] },
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
  const [open, setOpen] = useState<Record<string, boolean>>(() => Object.fromEntries(GROUPS.map((g) => [g.label, true])));

  useEffect(() => setMore(false), [path]);

  async function logout() {
    // Al salir se borra todo lo guardado en el dispositivo (páginas, cola y datos).
    await clearOfflineData();
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const moreActive = !["/", "/map"].includes(path) && !path.startsWith("/stores");

  return (
    <>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 flex-col border-r border-slate-200 bg-white md:flex">
        <div className="flex h-16 items-center gap-2.5 px-5">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/mahou-m.png" alt="" width={32} height={32} className="h-8 w-8 object-contain" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <span className="flex h-8 items-center rounded-md bg-[#DE1F26] px-2.5"><img src="/brand/mahou-wordmark-white.png" alt="Mahou" width={82} height={20} className="h-5 w-auto" /></span>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-3" aria-label="Principal">
          {GROUPS.map((g) => {
            const Icon = g.icon;
            const act = groupActive(g);
            if (g.href) {
              return (
                <Link key={g.label} href={g.href} aria-current={act ? "page" : undefined}
                  className={clsx("nav-item flex h-9 items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium", act ? "bg-brand-50 text-brand-700" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                  <Icon size={18} strokeWidth={act ? 2.2 : 1.8} className="shrink-0" /> <span>{g.label}</span>
                  {g.href === "/" && unread > 0 && <span className="badge ml-auto bg-st-late text-[#fff]">{unread}</span>}
                  <Pending />
                </Link>
              );
            }
            const isOpen = open[g.label] || act;
            return (
              <div key={g.label}>
                <button type="button" onClick={() => setOpen({ ...open, [g.label]: !open[g.label] })} aria-expanded={isOpen}
                  className={clsx("nav-item flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium", act ? "text-slate-900" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900")}>
                  <Icon size={18} strokeWidth={act ? 2.2 : 1.8} className={clsx("shrink-0", act && "text-brand-600")} /> <span>{g.label}</span>
                  <ChevronDown size={15} className={clsx("ml-auto text-slate-400 transition-transform duration-200", isOpen ? "rotate-0" : "-rotate-90")} />
                </button>
                <div className="nav-fold" data-open={isOpen}>
                  <div>
                    <ul className="relative ml-[1.35rem] space-y-0.5 border-l border-slate-200 py-0.5 pl-3">
                      {(g.items ?? []).map((i) => {
                        const on = isActive(i.href);
                        return (
                          <li key={i.href}>
                            <Link href={i.href} aria-current={on ? "page" : undefined}
                              className={clsx("nav-item relative flex h-8 items-center rounded-md px-2.5 text-[13px]", on ? "bg-brand-50 font-semibold text-brand-700" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900")}>
                              {on && <span aria-hidden className="absolute -left-[0.82rem] top-1.5 h-5 w-0.5 rounded-full bg-brand-600" />}
                              {i.label}
                              <Pending />
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-3">
          <button onClick={logout} className="nav-item flex h-9 w-full items-center gap-3 rounded-lg px-3 text-[13.5px] font-medium text-slate-600 hover:bg-slate-100">
            <LogOut size={18} /> <span>Cerrar sesión</span>
          </button>
        </div>
      </aside>

      {more && (
        <div className="fixed inset-0 z-[55] md:hidden" onClick={() => setMore(false)}>
          <div className="fade-in absolute inset-0 bg-black/40" />
          <div role="dialog" aria-label="Más secciones" onClick={(e) => e.stopPropagation()}
            className="sheet-up absolute inset-x-0 bottom-0 max-h-[85dvh] overflow-y-auto rounded-t-[1.5rem] bg-white p-4 pb-[calc(6.5rem+env(safe-area-inset-bottom))] shadow-pop">
            <div className="mb-1 flex items-center justify-between"><span className="font-semibold">Menú</span><button aria-label="Cerrar" onClick={() => setMore(false)} className="p-2"><X size={18} /></button></div>
            {GROUPS.filter((g) => g.items).map((g) => (
              <div key={g.label} className="py-1.5">
                <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">{g.label}</div>
                {(g.items ?? []).map((i) => (
                  <Link key={i.href} href={i.href} className={clsx("nav-item flex min-h-11 items-center rounded-lg px-3 text-[15px]", isActive(i.href) ? "bg-brand-50 font-semibold text-brand-700" : "hover:bg-slate-100")}>{i.label}</Link>
                ))}
              </div>
            ))}
            <button onClick={logout} className="mt-1 flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-[15px] text-slate-600 hover:bg-slate-100"><LogOut size={18} /> Cerrar sesión</button>
          </div>
        </div>
      )}

      <nav aria-label="Principal" className="fixed inset-x-4 bottom-[max(0.75rem,env(safe-area-inset-bottom))] z-[60] mx-auto flex max-w-md items-center rounded-full border border-slate-200 bg-white/90 px-2 shadow-[0_8px_30px_rgb(0_0_0/0.16)] backdrop-blur-xl md:hidden">
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
        <Link href="/visits/new" aria-label="Iniciar visita" className="nav-item mx-1 -mt-6 flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-brand-600 text-[rgb(var(--on-accent))] shadow-[0_6px_18px_rgb(var(--brand-600)/0.45)]">
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
