import { Nav } from "@/components/Nav";
import { supabaseServer } from "@/lib/supabase/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { count } = await sb.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null).is("resolved_at", null);
  return (
    <div className="min-h-dvh">
      <Nav unread={count ?? 0} />
      <main className="page-in min-w-0 px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] md:ml-56 md:px-8 md:pb-10 md:pt-6">
        <div className="page">{children}</div>
      </main>
    </div>
  );
}
