"use client";
import { useEffect } from "react";
import { warmPages } from "./OfflineManager";

/** Guarda en el móvil las páginas indicadas (ruta del día y fichas de sus tiendas) para consultarlas sin red. */
export function OfflineWarmup({ urls }: { urls: string[] }) {
  const key = urls.join("|");
  useEffect(() => {
    const t = setTimeout(() => warmPages(key.split("|").filter(Boolean)), 2500);
    return () => clearTimeout(t);
  }, [key]);
  return null;
}
