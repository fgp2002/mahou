// Utilidades geográficas y matrices de tiempo de desplazamiento.

export interface LatLng {
  lat: number;
  lng: number;
}

export interface Matrix {
  /** duración en segundos de i a j */
  dur: number[][];
  /** distancia en metros de i a j */
  dist: number[][];
  /** true si es una estimación (no proviene de un servicio de rutas) */
  estimated: boolean;
  provider: string;
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const R = 6371;
  const toRad = (x: number) => (x * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

/**
 * Estimación sin servicio de rutas: distancia en línea recta × factor de
 * rodeo (1,35) a una velocidad media de 45 km/h. Es solo una aproximación.
 */
export function estimateMatrix(points: LatLng[], roadFactor = 1.35, avgKmh = 45): Matrix {
  const n = points.length;
  const dur: number[][] = [];
  const dist: number[][] = [];
  for (let i = 0; i < n; i++) {
    dur.push(new Array(n).fill(0));
    dist.push(new Array(n).fill(0));
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const km = haversineKm(points[i], points[j]) * roadFactor;
      dist[i][j] = Math.round(km * 1000);
      dur[i][j] = Math.round((km / avgKmh) * 3600);
    }
  }
  return { dur, dist, estimated: true, provider: "estimación (línea recta × 1,35 a 45 km/h)" };
}

/** Matriz real por carretera con Google Routes API (computeRouteMatrix). */
export async function googleMatrix(points: LatLng[], apiKey: string): Promise<Matrix> {
  const n = points.length;
  if (n > 25) throw new Error("Demasiados puntos para una sola matriz (máx. 25)");
  const wp = (p: LatLng) => ({ waypoint: { location: { latLng: { latitude: p.lat, longitude: p.lng } } } });
  const res = await fetch("https://routes.googleapis.com/distanceMatrix/v2:computeRouteMatrix", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "originIndex,destinationIndex,duration,distanceMeters,status,condition",
    },
    body: JSON.stringify({
      origins: points.map(wp),
      destinations: points.map(wp),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Google Routes respondió ${res.status}: ${text.slice(0, 200)}`);
  }
  const rows = (await res.json()) as Array<{
    originIndex?: number;
    destinationIndex?: number;
    duration?: string;
    distanceMeters?: number;
    condition?: string;
  }>;
  const dur: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const dist: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const seen = new Set<string>();
  for (const r of rows) {
    const i = r.originIndex ?? 0;
    const j = r.destinationIndex ?? 0;
    if (i === j) {
      seen.add(`${i}-${j}`);
      continue;
    }
    if (r.condition && r.condition !== "ROUTE_EXISTS") continue;
    const secs = r.duration ? Number.parseInt(r.duration.replace("s", ""), 10) : NaN;
    if (Number.isNaN(secs)) continue;
    dur[i][j] = secs;
    dist[i][j] = r.distanceMeters ?? 0;
    seen.add(`${i}-${j}`);
  }
  if (seen.size < n * n) {
    throw new Error("Google Routes no devolvió todas las combinaciones de la matriz");
  }
  return { dur, dist, estimated: false, provider: "Google Routes API" };
}

export function googleMapsPlaceUrl(s: { lat: number | null; lng: number | null; address?: string | null; town?: string | null; postal_code?: string | null }): string {
  const dest = s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : [s.address, s.postal_code, s.town, "Málaga"].filter(Boolean).join(", ");
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(dest)}&travelmode=driving`;
}

export interface UrlStop {
  lat: number | null;
  lng: number | null;
  address?: string | null;
  town?: string | null;
  postal_code?: string | null;
}

function stopQuery(s: UrlStop): string {
  return s.lat !== null && s.lng !== null ? `${s.lat},${s.lng}` : [s.address, s.postal_code, s.town, "Málaga"].filter(Boolean).join(", ");
}

/** Enlace de Google Maps con varias paradas (máx. 9 intermedias en la app móvil). */
export function googleMapsRouteUrl(stops: UrlStop[]): string | null {
  if (stops.length === 0) return null;
  const last = stops[stops.length - 1];
  const mid = stops.slice(0, -1).slice(0, 9);
  const params = new URLSearchParams({ api: "1", destination: stopQuery(last), travelmode: "driving" });
  if (mid.length) params.set("waypoints", mid.map(stopQuery).join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** Trazado por carretera (polilínea codificada) de un recorrido en orden, con Google Routes API. */
export async function googleRoutePolyline(points: LatLng[], apiKey: string): Promise<string | null> {
  if (points.length < 2) return null;
  const wp = (p: LatLng) => ({ location: { latLng: { latitude: p.lat, longitude: p.lng } } });
  const res = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Goog-Api-Key": apiKey, "X-Goog-FieldMask": "routes.polyline.encodedPolyline" },
    body: JSON.stringify({
      origin: wp(points[0]),
      destination: wp(points[points.length - 1]),
      intermediates: points.slice(1, -1).map(wp),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
    }),
  });
  if (!res.ok) return null;
  const j = (await res.json()) as { routes?: { polyline?: { encodedPolyline?: string } }[] };
  return j.routes?.[0]?.polyline?.encodedPolyline ?? null;
}

/** Decodifica una polilínea de Google en una lista de [lat, lng]. */
export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const k of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (k === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}
