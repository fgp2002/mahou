import { redirect } from "next/navigation";

// Las estadísticas se han convertido en Informes: periodo, alcance, comparativas y exportación.
export default function StatsPage() {
  redirect("/reports");
}
