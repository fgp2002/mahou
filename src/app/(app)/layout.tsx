import { PageTransition } from "@/components/PageTransition";
import { Nav } from "@/components/Nav";
import { TopBar, type AlertItem } from "@/components/TopBar";
import { ToastHost } from "@/components/Toast";
import { PullToRefresh } from "@/components/PullToRefresh";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const [{ count }, { data: alerts }] = await Promise.all([
    sb.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null).is("resolved_at", null),
    sb.from("alerts").select("id,message,severity").is("resolved_at", null).order("created_at", { ascending: false }).limit(10),
  ]);
  return (
    <div className="h-dvh overflow-hidden">
      <Nav unread={count ?? 0} />
      <ToastHost />
      <PullToRefresh />
      <main className="scroll-root min-w-0 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] md:ml-56 md:px-6 md:pb-10 xl:px-8">
        <TopBar unread={count ?? 0} alerts={(alerts ?? []) as AlertItem[]} />
        <div className="page pt-2"><PageTransition>{children}</PageTransition></div>
      </main>
    </div>
  );
}
