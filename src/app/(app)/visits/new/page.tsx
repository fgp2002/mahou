import { supabaseServer } from "@/lib/supabase/server";
import { loadSettings } from "@/lib/server/load";
import { NewVisit } from "@/components/NewVisit";
import { PageHeader } from "@/components/ui";
import { DEFAULT_DURATIONS } from "@/lib/types";

export default async function NewVisitPage({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  const { store } = await searchParams;
  const sb = await supabaseServer();
  const settings = await loadSettings();
  let initial = null;
  if (store) {
    const { data } = await sb.from("stores").select("id,name,town").eq("id", store).maybeSingle();
    initial = data;
  }
  return (
    <div>
      <PageHeader title="Nueva visita" />
      <NewVisit initialStore={initial} durations={{ ...DEFAULT_DURATIONS, ...settings.visit_durations }} />
    </div>
  );
}
