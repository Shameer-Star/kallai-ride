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

// --- Nominatim fetch with retry logic ---
async function fetchNominatimRaw(
  url: URL,
  signal?: AbortSignal,
  retries = 2
): Promise<any[]> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url.toString(), {
        signal,
        headers: { "Accept-Language": "en,ta" },
      });
      if (res.status === 429 && attempt < retries) {
        // Rate limited — wait and retry
        await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
        continue;
      }
      if (!res.ok) return [];
      return await res.json();
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 500 * (attempt + 1)));
        continue;
      }
      return [];
    }
  }
  return [];
}

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

  const data = await fetchNominatimRaw(url, signal) as Array<{ display_name: string; lat: string; lon: string }>;
  return data.map((d) => ({
    display_name: d.display_name,
    lat: parseFloat(d.lat),
    lng: parseFloat(d.lon),
  }));
}

export const LOCAL_PLACES: GeoPlace[] = [
  {
    display_name: "Adhaiyur, Kallakurichi, Tamil Nadu, India",
    lat: 11.7880009,
    lng: 79.1562643,
    keywords: ["adhaiyur", "adaiyur", "adhayur", "adayur", "அடையூர்", "அதையூர்"]
  },
  {
    display_name: "Eraiyur, Kallakurichi, Tamil Nadu, India",
    lat: 11.7825451,
    lng: 79.1971742,
    keywords: ["eraiyur", "erayur", "eraiyoor", "இறையூர்"]
  },
  {
    display_name: "Rishivandiyam, Kallakurichi, Tamil Nadu, India",
    lat: 11.8153,
    lng: 79.1028,
    keywords: ["rishivandiyam", "rishivndiyam", "rishivandhiyam", "risivandiyam", "ரிஷிவந்தியம்"]
  },
  {
    display_name: "Thiyagadurugam, Kallakurichi, Tamil Nadu, India",
    lat: 11.7454,
    lng: 79.0838,
    keywords: ["thiyagadurugam", "thyagadurugam", "thiyagadurgam", "தியாகதுருகம்"]
  },
  {
    display_name: "Ulundurpettai, Kallakurichi, Tamil Nadu, India",
    lat: 11.6917,
    lng: 79.2902,
    keywords: ["ulundurpettai", "ulundurpet", "ulundur", "உளுந்தூர்ப்பேட்டை"]
  },
  {
    display_name: "Kallakurichi, Tamil Nadu, India",
    lat: 11.7383,
    lng: 78.9639,
    keywords: ["kallakurichi", "TN", "kallakurchi", "kallakuruchi", "கள்ளக்குறிச்சி"]
  },
  {
    display_name: "Elavanasur Kottai, Kallakurichi, Tamil Nadu, India",
    lat: 11.8300,
    lng: 79.0700,
    keywords: ["elavanasur", "elavanasur kottai", "elavanasurkottai", "elavanasoor", "எலவனசூர் கோட்டை", "எலவனசூர்"]
  },
];

// --- Normalized fuzzy matching for local places ---
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\u0B80-\u0BFF]/g, "") // keep only alphanumeric + Tamil unicode
    .trim();
}

function fuzzyMatch(query: string, target: string): boolean {
  const nq = normalize(query);
  const nt = normalize(target);
  if (!nq || !nt) return false;
  // Direct substring match
  if (nt.includes(nq) || nq.includes(nt)) return true;
  // Check if query chars appear in order (subsequence match for typos)
  if (nq.length >= 3) {
    let ti = 0;
    let matched = 0;
    for (let qi = 0; qi < nq.length && ti < nt.length; qi++) {
      while (ti < nt.length) {
        if (nt[ti] === nq[qi]) {
          matched++;
          ti++;
          break;
        }
        ti++;
      }
    }
    // At least 70% of query chars match in order
    if (matched / nq.length >= 0.7) return true;
  }
  return false;
}

function matchLocalPlaces(query: string): GeoPlace[] {
  const q = query.trim();
  if (!q) return [];
  return LOCAL_PLACES.filter((p) => {
    const name = p.display_name.split(",")[0];
    if (fuzzyMatch(q, name)) return true;
    return p.keywords?.some((kw) => fuzzyMatch(q, kw)) ?? false;
  });
}

// Instant local-only search (no network, no debounce needed)
export function searchLocalPlaces(query: string): GeoPlace[] {
  return matchLocalPlaces(query);
}

// --- LRU Search Result Cache ---
const SEARCH_CACHE_SIZE = 50;
const searchCache = new Map<string, { results: GeoPlace[]; timestamp: number }>();

function getCachedSearch(key: string): GeoPlace[] | null {
  const entry = searchCache.get(key);
  if (entry && Date.now() - entry.timestamp < 120000) { // 2 min TTL
    // Move to end (LRU)
    searchCache.delete(key);
    searchCache.set(key, entry);
    return entry.results;
  }
  return null;
}

function setCachedSearch(key: string, results: GeoPlace[]): void {
  searchCache.set(key, { results, timestamp: Date.now() });
  if (searchCache.size > SEARCH_CACHE_SIZE) {
    const firstKey = searchCache.keys().next().value;
    if (firstKey) searchCache.delete(firstKey);
  }
}

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  const q = query.trim();
  if (!q) return [];

  // Check cache first
  const cacheKey = q.toLowerCase();
  const cached = getCachedSearch(cacheKey);
  if (cached) return cached;

  // Match local static database first (always instant)
  const matchedLocal = matchLocalPlaces(q);

  // 1) Try the full query as-is
  let results: GeoPlace[] = [];
  try {
    results = await fetchNominatim(q, signal);
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
    // Ignore fetch failures
  }
  
  // Combine results with local matches, keeping local matches at the top and deduplicating
  let combined = [...matchedLocal, ...results];
  const seen = new Set<string>();
  combined = combined.filter((c) => {
    const key = `${c.lat.toFixed(3)},${c.lng.toFixed(3)}`; // De-dup by proximity too
    const nameKey = c.display_name.toLowerCase();
    if (seen.has(key) || seen.has(nameKey)) return false;
    seen.add(key);
    seen.add(nameKey);
    return true;
  });

  if (combined.length > 0) {
    const result = combined.slice(0, 8);
    setCachedSearch(cacheKey, result);
    return result;
  }

  // 2) Strip common connector words (\"near\", \"next to\", \"opposite\", commas) and retry
  const cleaned = q
    .replace(/\b(near|next to|opposite|opp|behind|beside|at)\b/gi, " ")
    .replace(/[,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (cleaned !== q && cleaned.length > 0) {
    try {
      results = await fetchNominatim(cleaned, signal);
      if (results.length > 0) {
        const result = results.slice(0, 8);
        setCachedSearch(cacheKey, result);
        return result;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
    }
  }

  // 3) Try each significant token individually with \", Tamil Nadu, India\" suffix
  // This is what unlocks small villages like \"adhaiyur\", \"elavanasur\", etc.
  const tokens = cleaned.split(" ").filter((t) => t.length >= 3);
  for (const token of tokens) {
    try {
      results = await fetchNominatim(`${token}, Tamil Nadu, India`, signal);
      if (results.length > 0) {
        const result = results.slice(0, 8);
        setCachedSearch(cacheKey, result);
        return result;
      }
    } catch (err: any) {
      if (err?.name === "AbortError") throw err;
    }
  }

  // 4) Last resort: full query + ", India" (no viewbox bias)
  try {
    const url = new URL("https://nominatim.openstreetmap.org/search");
    url.searchParams.set("format", "json");
    url.searchParams.set("q", `${cleaned}, India`);
    url.searchParams.set("limit", "8");
    url.searchParams.set("countrycodes", "in");
    url.searchParams.set("addressdetails", "1");
    const data = await fetchNominatimRaw(url, signal) as Array<{ display_name: string; lat: string; lon: string }>;
    if (data.length > 0) {
      const result = data.map((d) => ({ display_name: d.display_name, lat: parseFloat(d.lat), lng: parseFloat(d.lon) }));
      setCachedSearch(cacheKey, result);
      return result;
    }
  } catch (err: any) {
    if (err?.name === "AbortError") throw err;
  }

  // Cache the empty result too (avoid re-fetching)
  setCachedSearch(cacheKey, []);
  return [];
}

export async function reverseGeocode(lat: number, lng: number): Promise<string> {
  // Check reverse geocode cache
  const cacheKey = `rev:${lat.toFixed(4)},${lng.toFixed(4)}`;
  const cached = getCachedSearch(cacheKey);
  if (cached && cached.length > 0) return cached[0].display_name;

  try {
    const url = new URL("https://nominatim.openstreetmap.org/reverse");
    url.searchParams.set("format", "json");
    url.searchParams.set("lat", String(lat));
    url.searchParams.set("lon", String(lng));
    url.searchParams.set("zoom", "16");
    const data = await fetchNominatimRaw(url) as any;
    const name = data?.display_name ?? `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
    setCachedSearch(cacheKey, [{ display_name: name, lat, lng }]);
    return name;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

// --- Get current location as a Promise with timeout ---
export function getCurrentLocationAsync(
  timeoutMs = 6000
): Promise<{ lat: number; lng: number }> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation not supported"));
      return;
    }
    const timeoutId = window.setTimeout(() => {
      reject(new Error("Location timeout"));
    }, timeoutMs);

    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(timeoutId);
        resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
      },
      (err) => {
        clearTimeout(timeoutId);
        reject(err);
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: timeoutMs }
    );
  });
}

// --- LRU Route Cache for OSRM results ---
type RouteResult = { distanceKm: number; durationSec: number; geometry: [number, number][] };
const ROUTE_CACHE_SIZE = 30;
const routeCache = new Map<string, { result: RouteResult; timestamp: number }>();

function makeRouteKey(a: { lat: number; lng: number }, b: { lat: number; lng: number }): string {
  // Round to 4 decimal places (~11m precision) for cache hits on nearby points
  return `${a.lat.toFixed(4)},${a.lng.toFixed(4)}-${b.lat.toFixed(4)},${b.lng.toFixed(4)}`;
}

// Free routing via OSRM public demo server — returns distance in km and duration in seconds
export async function getRouteDistanceKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): Promise<RouteResult | null> {
  const key = makeRouteKey(a, b);
  
  // Check cache first (valid for 60 seconds)
  const cached = routeCache.get(key);
  if (cached && Date.now() - cached.timestamp < 60000) {
    return cached.result;
  }

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
    const result: RouteResult = {
      distanceKm: route.distance / 1000,
      durationSec: route.duration ?? 0,
      geometry: coords,
    };

    // Store in cache with LRU eviction
    routeCache.set(key, { result, timestamp: Date.now() });
    if (routeCache.size > ROUTE_CACHE_SIZE) {
      const firstKey = routeCache.keys().next().value;
      if (firstKey) routeCache.delete(firstKey);
    }

    return result;
  } catch {
    return null;
  }
}
