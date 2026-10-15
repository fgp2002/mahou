// Service worker de Mahou: la app se abre sin conexión con lo último que se vio.
// - Recursos estáticos (_next/static, logos, iconos): caché primero.
// - Páginas: red primero; sin red, la última copia guardada (o un aviso si nunca se abrió).
// - Datos de Supabase y /api: nunca se guardan aquí (los cambios sin red van a la cola de la app).
const VERSION = "v2";
const STATIC = `static-${VERSION}`;
const PAGES = `pages-${VERSION}`;

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (![STATIC, PAGES].includes(k)) await caches.delete(k);
    await self.clients.claim();
  })());
});

const OFFLINE_HTML = `<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Sin conexión · Mahou</title><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;padding:24px;text-align:center;color:#111">
<div><img src="/brand/mahou-m.png" width="64" height="64" alt=""><h1 style="font-size:20px">Sin conexión</h1>
<p style="color:#555">Esta pantalla no se había abierto antes, así que no está guardada en el móvil.</p>
<p><a href="/" style="color:#DE1F26;font-weight:700">Ir a Hoy</a></p></div></body></html>`;

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/login")) return;

  // Estáticos inmutables (las imágenes las gestiona el propio navegador)
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith((async () => {
      const cache = await caches.open(STATIC);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      if (res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Peticiones RSC de la navegación interna: sin red fallan y Next hace una navegación completa (que sí se sirve de caché).
  if (req.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) return;

  if (req.mode === "navigate") {
    event.respondWith((async () => {
      const cache = await caches.open(PAGES);
      try {
        const res = await fetch(req);
        if (res.ok && !res.redirected) cache.put(url.pathname + url.search, res.clone());
        return res;
      } catch {
        const hit = (await cache.match(url.pathname + url.search)) || (await cache.match(url.pathname, { ignoreSearch: url.pathname === "/offline/visit" }));
        return hit || new Response(OFFLINE_HTML, { headers: { "Content-Type": "text/html; charset=utf-8" } });
      }
    })());
  }
});

// La app pide guardar páginas concretas (ruta del día, fichas de sus tiendas) para tenerlas sin red.
self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    event.waitUntil((async () => {
      const cache = await caches.open(PAGES);
      for (const u of data.urls.slice(0, 40)) {
        try {
          const res = await fetch(u, { credentials: "same-origin" });
          if (res.ok && !res.redirected) await cache.put(u, res);
        } catch { /* sin red */ }
      }
    })());
  }
});
