"use client";
import { useEffect } from "react";

// Bloqueo del desplazamiento del fondo mientras hay un modal abierto.
// Admite modales anidados (contador) y conserva la posición: solo se congela el contenedor que scrollea.
let locks = 0;
export function useScrollLock(active = true) {
  useEffect(() => {
    if (!active) return;
    const root = document.documentElement;
    locks++;
    root.setAttribute("data-scroll-locked", "");
    return () => {
      locks = Math.max(0, locks - 1);
      if (!locks) root.removeAttribute("data-scroll-locked");
    };
  }, [active]);
}

/** Para componentes de servidor o JSX donde no cabe un hook: se monta dentro del modal. */
export function ScrollLock() {
  useScrollLock(true);
  return null;
}
