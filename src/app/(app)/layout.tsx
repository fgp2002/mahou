import { Suspense } from "react";
import { PageTransition } from "@/components/PageTransition";
import { Nav } from "@/components/Nav";
import { TopBar, type AlertItem } from "@/components/TopBar";
import { ToastHost } from "@/components/Toast";
import { PullToRefresh } from "@/components/PullToRefresh";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  // Una sola consulta: las alertas abiertas y, de ellas, cuántas sin leer.
  const { data: open } = await sb.from("alerts").select("id,message,severity,read_at").is("resolved_at", null).order("created_at", { ascending: false }).limit(50);
  const alerts = (open ?? []).slice(0, 10);
  const count = (open ?? []).filter((a) => !a.read_at).length;
  return (
    <div className="h-dvh overflow-hidden">
      <Suspense fallback={null}><Nav unread={count ?? 0} /></Suspense>
      <ToastHost />
      <PullToRefresh />
      <main className="scroll-root min-w-0 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:ml-60 md:px-6 md:pb-10 xl:px-8">
        <TopBar unread={count ?? 0} alerts={alerts as AlertItem[]} />
        <div className="page pt-2"><PageTransition>{children}</PageTransition></div>
      </main>
    </div>
  );
}
