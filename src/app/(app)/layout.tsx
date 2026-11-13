import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Nav } from "@/components/Nav";
import { TopBar, type AlertItem } from "@/components/TopBar";
import { ToastHost } from "@/components/Toast";
import { PullToRefresh } from "@/components/PullToRefresh";
import { OfflineManager } from "@/components/OfflineManager";
import { supabaseServer } from "@/lib/supabase/server";
import { getMe } from "@/lib/server/me";
import { roleName } from "@/lib/enterprise/roles";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const me = await getMe();
  const who = me && me.role && !me.isOwner ? { name: me.name, role: `${roleName(me.role)}${me.unitName ? ` · ${me.unitName}` : me.orgKind === "externa" && me.orgName ? ` · ${me.orgName}` : ""}` } : me?.isOwner && me.name ? { name: me.name, role: "Acceso total" } : null;
  // Una sola consulta: las alertas abiertas y, de ellas, cuántas sin leer.
  const { data: open } = await sb.from("alerts").select("id,message,severity,read_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(50);
  const alerts = (open ?? []).slice(0, 10);
  const count = (open ?? []).filter((a) => !a.read_at).length;
  return (
    <div className="h-dvh overflow-hidden">
      <Suspense fallback={null}><Nav unread={count ?? 0} perms={me?.permissions ?? ["todo.todo"]} who={who} /></Suspense>
      <ToastHost />
      <PullToRefresh />
      <OfflineManager />
      <main className="scroll-root min-w-0 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom))] pl-[max(1rem,env(safe-area-inset-left))] pr-[max(1rem,env(safe-area-inset-right))] md:px-6 lg:ml-64 lg:pb-12 xl:px-10">
        <TopBar unread={count ?? 0} alerts={alerts as AlertItem[]} />
        <div className="page pt-4 lg:pt-3"><PageTransition>{children}</PageTransition></div>
      </main>
    </div>
  );
}
