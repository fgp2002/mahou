// Geocodificación con Google Geocoding API (solo servidor).
const ABBR: [RegExp, string][] = [
  [/^CL\.?\s/i, "Calle "], [/^AV\.?\s|^AVDA\.?\s/i, "Avenida "], [/^CA\.?\s|^CR\.?\s|^CTRA\.?\s/i, "Carretera "],
  [/^PL\.?\s|^PZA\.?\s/i, "Plaza "], [/^CM\.?\s/i, "Camino "], [/^PA\.?\s|^PS\.?\s|^PSO\.?\s/i, "Paseo "],
  [/^PO\.?\s|^PG\.?\s/i, "Polígono "], [/^PJ\.?\s/i, "Pasaje "], [/^UR\.?\s/i, "Urbanización "],
];
// Caja aproximada de la provincia de Málaga.
const BBOX = { latMin: 36.35, latMax: 37.25, lngMin: -5.65, lngMax: -3.85 };

export function normalizeAddress(address: string | null): string {
  let a = (address ?? "").trim();
  for (const [re, rep] of ABBR) if (re.test(a)) { a = a.replace(re, rep); break; }
  return a.replace(/,?\s*S\/N\b/gi, "").replace(/\s+/g, " ").trim();
}

export interface GeoResult {
  status: "ok" | "partial" | "failed";
  lat?: number; lng?: number; formatted?: string; placeId?: string; error?: string;
}

export async function geocodeOne(
  s: { address: string | null; town: string | null; postal_code: string | null; province: string | null },
  apiKey: string,
): Promise<GeoResult> {
  const street = normalizeAddress(s.address);
  const place = [s.postal_code, s.town].filter(Boolean).join(" ");
  const query = [street, place, s.province || "Málaga", "España"].filter(Boolean).join(", ");
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}&components=country:ES&region=es&language=es&key=${apiKey}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return { status: "failed", error: `HTTP ${res.status}` };
  const j = await res.json();
  if (j.status === "ZERO_RESULTS") return { status: "failed", error: "Sin resultados" };
  if (j.status !== "OK") return { status: "failed", error: `${j.status}${j.error_message ? ": " + j.error_message : ""}` };
  const r = j.results[0];
  const { lat, lng } = r.geometry.location;
  const inside = lat >= BBOX.latMin && lat <= BBOX.latMax && lng >= BBOX.lngMin && lng <= BBOX.lngMax;
  if (!inside) return { status: "failed", error: "Resultado fuera de la provincia", lat, lng, formatted: r.formatted_address };
  const precise = r.geometry.location_type === "ROOFTOP" || r.geometry.location_type === "RANGE_INTERPOLATED";
  return { status: precise && !r.partial_match ? "ok" : "partial", lat, lng, formatted: r.formatted_address, placeId: r.place_id };
}
