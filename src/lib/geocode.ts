// Free geocoding via Nominatim (OpenStreetMap). Throttle to 1 req/sec per their policy.
// We use it for autocomplete with debouncing on the caller side.

export type GeoPlace = {
  display_name: string;
  lat: number;
  lng: number;
  keywords?: string[];
};

// Soft bias toward our service area (rural Tamil Nadu — Kallakurichi region)
const VIEWBOX = "78.3,12.6,79.7,11.2"; // wider: left,top,right,bottom

async function fetchNominatim(
  q: string,
  signal?: AbortSignal,
  bounded = false
): Promise<GeoPlace[]> {
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", q);
  url.searchParams.set("limit", "10");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", bounded ? "1" : "0");
  url.searchParams.set("addressdetails", "1");
  url.searchParams.set("dedupe", "1");

  const res = await fetch(url.toString(), {
    signal,
    headers: { "Accept-Language": "en,ta" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map((d) => ({
    display_name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

export const LOCAL_PLACES: GeoPlace[] = [
  {
    display_name: "Adhaiyur, Kallakurichi, Tamil Nadu, India",
    lat: 11.7645,
    lng: 78.9812,
    keywords: ["adhaiyur", "adaiyur", "அடையூர்"]
  },
  {
    display_name: "Rishivandiyam, Kallakurichi, Tamil Nadu, India",
    lat: 11.8153,
    lng: 79.1028,
    keywords: ["rishivandiyam", "rishivndiyam", "rishivandhiyam", "ரிஷிவந்தியம்"]
  },
  {
    display_name: "Thiyagadurugam, Kallakurichi, Tamil Nadu, India",
    lat: 11.7454,
    lng: 79.0838,
    keywords: ["thiyagadurugam", "thyagadurugam", "தியாகதுருகம்"]
  },
  {
    display_name: "Eraiyur, Kallakurichi, Tamil Nadu, India",
    lat: 11.6441,
    lng: 79.0305,
    keywords: ["eraiyur", "erayur", "இறையூர்"]
  },
  {
    display_name: "Ulundurpettai, Kallakurichi, Tamil Nadu, India",
    lat: 11.6917,
    lng: 79.2902,
    keywords: ["ulundurpettai", "ulundurpet", "உளுந்தூர்ப்பேட்டை"]
  },
  {
    display_name: "Kallakurichi, Tamil Nadu, India",
    lat: 11.7383,
    lng: 78.9639,
    keywords: ["kallakurichi", "kallai", "கள்ளக்குறிச்சி"]
  },
];

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (!q) return [];

  // Match local static database first
  const queryLower = q.toLowerCase();
  const matchedLocal = LOCAL_PLACES.filter((p) => {
    const name = p.display_name.split(",")[0].toLowerCase();
    const matchesKeyword = p.keywords?.some((kw) => 
      kw.includes(queryLower) || queryLower.includes(kw)
    );
    return name.includes(queryLower) || queryLower.includes(name) || matchesKeyword;
  });

  // 1) Try the full query as-is
  let results: GeoPlace[] = [];
  try {
    results = await fetchNominatim(q, signal);
  } catch {
    // Ignore fetch failures
  }
  
  // Combine results with local matches, keeping local matches at the top and deduplicating
  let combined = [...matchedLocal, ...results];
  const seen = new Set<string>();
  combined = combined.filter((c) => {
    if (seen.has(c.display_name)) return false;
    seen.add(c.display_name);
    return true;
  });

  if (combined.length > 0) return combined.slice(0, 8);

  // 2) Strip common connector words ("near", "next to", "opposite", commas) and retry
  const cleaned = q
    .replace(/\b(near|next to|opposite|opp|behind|beside|at)\b/gi, " ")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned !== q && cleaned.length > 0) {
    results = await fetchNominatim(cleaned, signal);
    if (results.length > 0) return results.slice(0, 8);
  }

  // 3) Try each significant token individually with ", Tamil Nadu, India" suffix
  // This is what unlocks small villages like "adhaiyur", "elavanasur", etc.
  const tokens = cleaned.split(" ").filter((t) => t.length >= 3);
  for (const token of tokens) {
    results = await fetchNominatim(`${token}, Tamil Nadu, India`, signal);
    if (results.length > 0) return results.slice(0, 8);
  }

  // 4) Last resort: full query + ", India" (no viewbox bias)
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", `${cleaned}, India`);
    url.searchParams.set("limit", "8");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("addressdetails", "1");
    const res = await fetch(url.toString(), { signal, headers: { "Accept-Language": "en,ta" } });
    if (res.ok) {
      const data = (await res.json()) as Array<{ display_name: string; lat: string; lon: string }>;
      return data.map((d) => ({ display_name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
    }
  } catch {}

  return [];
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "16");
    const res = await fetch(url.toString(), { headers: { "Accept-Language": "en,ta" } });
    if (!res.ok) return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    const data = (await res.json()) as { display_name?: string };
    return data.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// Free routing via OSRM public demo server — returns distance in km
export async function getRouteDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<{ distanceKm: number; geometry: [number, number][] } | null> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${a.lng},${a.lat};${b.lng},${b.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const route = data.routes?.[0];
    if (!route) return null;
    const coords: [number, number][] = route.geometry.coordinates.map(
      (c: [number, number]) => [c[1], c[0]]
    );
    return { distanceKm: route.distance / 1000, geometry: coords };
  } catch {
    return null;
  }
}
