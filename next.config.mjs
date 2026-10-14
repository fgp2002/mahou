/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  experimental: {
    // Volver a una pestaña visitada hace <30 s es instantáneo; cualquier guardado hace router.refresh() y lo invalida.
    staleTimes: { dynamic: 30, static: 180 },
  },
};
export default nextConfig;
