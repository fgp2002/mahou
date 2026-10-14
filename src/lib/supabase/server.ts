import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/** Cliente de servidor con la sesión del usuario (respeta RLS). */
export async function supabaseServer() {
  const cookieStore = await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) cookieStore.set(name, value, options);
        } catch {
          // En Server Components no se pueden escribir cookies; el middleware refresca la sesión.
        }
      },
    },
  });
}

/**
 * Cliente con la clave de servicio: salta RLS. SOLO para tareas de servidor sin
 * sesión (cron). Nunca se importa desde código de cliente.
 */
export function supabaseService() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Falta SUPABASE_SERVICE_ROLE_KEY en las variables de entorno");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
