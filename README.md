# Mahou · Gestión comercial de visitas

App web (Next.js 15 + TypeScript + Tailwind) con Supabase (Postgres, Auth, Storage, RLS) desplegada en Vercel Hobby.

## Funciones
- Importación del Excel de puntos de venta (vista previa, deduplicación por ID original, resumen; respeta lo editado a mano).
- Panel con KPIs reales, tiendas con filtros/CRUD, contactos múltiples opcionales, pagos por concepto (con datos DEMO claramente marcados).
- Mapa Leaflet/OpenStreetMap con clustering, filtros, geolocalización, pantalla completa, ficha lateral y botón «Cómo llegar» (Google Maps).
- Periodicidad semanal/quincenal/mensual/ninguna con arrastre de un periodo; Audit = prioridad máxima sin olvidar al resto.
- Visitas: cronómetro, registro manual, fotos desde el móvil (Supabase Storage privado), historial.
- Rutas: generación (también automática a las 18:00 Madrid vía cron), tiempos por carretera con Google Routes (o estimación **marcada como tal**), aceptar/rechazar/reordenar/añadir/quitar/regenerar, motivos de las tiendas que no entran.
- Estadísticas con datos reales, alertas en la app, ajustes y exportación CSV.

## Variables de entorno (Vercel)
| Variable | Uso |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | cliente Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | solo cron (servidor), nunca al navegador |
| `CRON_SECRET` | autoriza `/api/cron/plan` |
| `GOOGLE_API_KEY` | Geocoding + Routes (solo servidor) |

## Cron en Vercel Hobby
Hobby solo admite crons diarios, en UTC y con ±59 min de precisión. `vercel.json` programa `/api/cron/plan` a las 16:00 y 17:00 UTC; el manejador solo actúa si en Madrid ya son las 18:00 o más y es idempotente (no crea ni sustituye una ruta existente). Solo corre en producción (rama `main`).

## Base de datos
Migraciones en `supabase/migrations`. RLS por `owner_id = auth.uid()`; el esquema admite varios usuarios.

## Tests
`npm test` ejecuta los tests de dominio (fechas, periodicidad, planificador).

## Estado de verificación
Compila en Vercel y los tests de dominio pasan. Las pruebas de extremo a extremo con la sesión real (importar, fotos, rutas) las hace el usuario tras iniciar sesión; ver el chat para la lista.
