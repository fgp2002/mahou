import type { MetadataRoute } from "next";

// Aplicación privada: se pide a los buscadores que no rastreen nada. No es seguridad (eso es login + RLS).
export default function robots(): MetadataRoute.Robots {
  return { rules: [{ userAgent: "*", disallow: "/" }] };
}
