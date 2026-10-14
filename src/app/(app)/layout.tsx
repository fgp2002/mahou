import { Nav } from "@/components/Nav";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sb = await supabaseServer();
  const { count } = await sb.from("alerts").select("id", { count: "exact", head: true }).is("read_at", null).is("resolved_at", null);
  return (
    <div className="min-h-screen">
      <Nav unread={count ?? 0} />
      <main className="px-4 pb-24 pt-4 md:ml-56 md:pb-8">{children}</main>
    </div>
  );
}
