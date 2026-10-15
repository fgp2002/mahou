import { Suspense } from "react";
import { OfflineVisit } from "@/components/OfflineVisit";

export const metadata = { title: "Visita sin conexión · Mahou" };

// Pantalla estática: el service worker la guarda para poder abrirla sin red.
export default function OfflineVisitPage() {
  return (
    <div className="scroll-root">
      <main className="mx-auto max-w-xl space-y-4 px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
        <Suspense fallback={null}><OfflineVisit /></Suspense>
      </main>
    </div>
  );
}
