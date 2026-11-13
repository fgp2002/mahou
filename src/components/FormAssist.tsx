"use client";
import { useEffect } from "react";

const FIELD = 'input:not([type=hidden]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=button]):not([type=submit]):not([type=reset]):not([type=range]):not([type=color]), select, textarea';

/**
 * Comportamiento común de todos los campos de la app (sin tocar cada pantalla):
 * - Enter en un campo de texto pasa al siguiente campo del mismo formulario, modal o tarjeta.
 *   En el último campo: si es un <form> se envía; si no, se cierra el teclado. Nunca envía a medias.
 * - En textarea, Enter hace salto de línea. Los campos que ya gestionan Enter (buscadores, etc.) mandan.
 * - Un formulario no se envía dos veces por doble pulsación.
 * - Al fallar una validación, el primer campo con error se centra en pantalla, sin borrar nada.
 */
export function FormAssist() {
  useEffect(() => {
    const visible = (el: HTMLElement) => !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length) && !el.closest("[hidden],[inert]");
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Enter" || e.defaultPrevented || e.isComposing || e.shiftKey || e.altKey || e.ctrlKey || e.metaKey) return;
      const el = e.target as HTMLElement;
      if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement)) return;
      if (el instanceof HTMLInputElement && (el.type === "search" || el.enterKeyHint === "search" || el.getAttribute("role") === "combobox")) return;
      if (el.closest("[data-enter=native]")) return;
      const scope = (el.closest("form") ?? el.closest("[role=dialog]") ?? el.closest(".card, section, [data-form]")) as HTMLElement | null;
      if (!scope) return;
      const fields = [...scope.querySelectorAll<HTMLElement>(FIELD)].filter((f) => visible(f) && !(f as HTMLInputElement).disabled && !(f as HTMLInputElement).readOnly);
      const i = fields.indexOf(el);
      if (i < 0) return;
      if (i < fields.length - 1) {
        e.preventDefault();
        const next = fields[i + 1];
        next.focus();
        if (next instanceof HTMLInputElement && /^(text|email|tel|url|number|password|search)$/.test(next.type)) next.select?.();
        return;
      }
      if (!el.closest("form")) { e.preventDefault(); el.blur(); }
    };
    const last = new WeakMap<HTMLFormElement, number>();
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target as HTMLFormElement;
      const now = Date.now();
      if (now - (last.get(f) ?? 0) < 900) { e.preventDefault(); e.stopImmediatePropagation(); return; }
      last.set(f, now);
    };
    let pendingScroll = false;
    const onInvalid = (e: Event) => {
      const el = e.target as HTMLElement;
      el.setAttribute("aria-invalid", "true");
      const clear = () => { if ((el as HTMLInputElement).checkValidity?.()) el.removeAttribute("aria-invalid"); };
      el.addEventListener("input", clear); el.addEventListener("change", clear);
      if (!pendingScroll) { pendingScroll = true; requestAnimationFrame(() => { el.scrollIntoView({ block: "center", behavior: "smooth" }); pendingScroll = false; }); }
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("submit", onSubmit, true);
    document.addEventListener("invalid", onInvalid, true);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("submit", onSubmit, true); document.removeEventListener("invalid", onInvalid, true); };
  }, []);
  return null;
}
