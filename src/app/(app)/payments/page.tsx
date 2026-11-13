import { redirect } from "next/navigation";

// El antiguo desglose de pagos vive ahora en Economía (con filtros, periodos y categorías).
export default function PaymentsPage() {
  redirect("/economy");
}
