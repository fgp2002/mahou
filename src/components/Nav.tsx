"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import clsx from "clsx";
import { LayoutDashboard, Store, Map, ClipboardList, Route, BarChart3, Settings, LogOut } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabase/client";

const ITEMS = [
  { href: "/", label: "Panel", icon: LayoutDashboard },
  { href: "/stores", label: "Tiendas", icon: Store },
  { href: "/map", label: "Mapa", icon: Map },
  { href: "/visits", label: "Visitas", icon: ClipboardList },
  { href: "/routes", label: "Rutas", icon: Route },
  { href: "/stats", label: "Estadísticas", icon: BarChart3 },
  { href: "/settings", label: "Ajustes", icon: Settings },
];

export function Nav({ unread }: { unread: number }) {
  const path = usePathname();
  const router = useRouter();
  const active = (h: string) => (h === "/" ? path === "/" : path.startsWith(h));

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <aside className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-slate-200 bg-white p-3 md:flex">
        <div className="mb-4 px-2 text-lg font-semibold text-brand-700">Mahou</div>
        <nav className="flex-1 space-y-1">
          {ITEMS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className={clsx("flex items-center gap-3 rounded-lg px-3 py-2 text-sm", active(href) ? "bg-brand-50 font-medium text-brand-700" : "text-slate-600 hover:bg-slate-100")}>
              <Icon size={18} /> {label}
              {href === "/" && unread > 0 && <span className="badge ml-auto bg-red-100 text-red-700">{unread}</span>}
            </Link>
          ))}
        </nav>
        <button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-600 hover:bg-slate-100">
          <LogOut size={18} /> Salir
        </button>
      </aside>
      <nav className="fixed inset-x-0 bottom-0 z-[1000] flex border-t border-slate-200 bg-white md:hidden">
        {ITEMS.slice(0, 5).map(({ href, label, icon: Icon }) => (
          <Link key={href} href={href} className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active(href) ? "text-brand-700" : "text-slate-500")}>
            <Icon size={20} /> {label}
          </Link>
        ))}
        <Link href="/settings" className={clsx("flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px]", active("/settings") ? "text-brand-700" : "text-slate-500")}>
          <Settings size={20} /> Ajustes
        </Link>
      </nav>
    </>
  );
}
