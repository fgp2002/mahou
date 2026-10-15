/** @type {import('next').NextConfig} */
const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://*.supabase.co";
const supaWs = supabase.replace(/^https:/, "wss:");

// CSP probada contra lo que usa la app: Supabase (datos, auth, Storage), teselas Esri del mapa
// y la barra de comentarios de Vercel en vistas previas. Next necesita 'unsafe-inline' para sus scripts de arranque.
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline' https://vercel.live`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase} https://server.arcgisonline.com https://*.arcgisonline.com https://vercel.live https://vercel.com`,
  "font-src 'self' data: https://vercel.live",
  `connect-src 'self' ${supabase} ${supaWs} https://vercel.live wss://ws-us3.pusher.com`,
  "frame-src https://vercel.live",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(self), geolocation=(self), microphone=(), payment=(), usb=(), interest-cohort=()" },
  // App privada: que ningún buscador la indexe (la seguridad real está en login + RLS).
  { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
];

const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Volver a una pestaña visitada hace <30 s es instantáneo; cualquier guardado hace router.refresh() y lo invalida.
    staleTimes: { dynamic: 30, static: 180 },
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};
export default nextConfig;
