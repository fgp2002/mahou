"use client";
import { supabaseBrowser } from "../supabase/client";
import { clearOfflineData } from "./db";
import { flush, pending } from "./outbox";

/**
 * Cierra sesión sin perder trabajo: antes intenta enviar lo pendiente y, si algo no se ha podido enviar,
 * avisa. Lo pendiente se queda guardado en el móvil y se envía cuando vuelve a entrar el mismo usuario.
 */
export async function safeLogout(): Promise<boolean> {
  try { await flush(); } catch { /* sin red */ }
  const { total } = await pending();
  if (total > 0 && !confirm(`Hay ${total} cambio${total === 1 ? "" : "s"} sin enviar (visitas, fotos o pagos hechos sin conexión).\n\nSe quedan guardados en este móvil y se enviarán solos cuando vuelvas a entrar con tu usuario.\n\n¿Cerrar sesión igualmente?`)) return false;
  await clearOfflineData();
  await supabaseBrowser().auth.signOut();
  return true;
}
