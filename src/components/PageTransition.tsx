"use client";
import { usePathname } from "next/navigation";

/** Al cambiar de pantalla el contenido entra con un fundido corto; cambiar un filtro no lo repite. */
export function PageTransition({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return <div key={path} className="page-in">{children}</div>;
}
