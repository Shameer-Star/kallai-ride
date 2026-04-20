// Free geocoding via Nominatim (OpenStreetMap). Throttle to 1 req/sec per their policy.
// We use it for autocomplete with debouncing on the caller side.

export type GeoPlace = {
  display_name: string;
  lat: number;
  lng: number;
};

// Bias results toward our service area (rural Tamil Nadu)
const VIEWBOX = "78.5,12.4,79.5,11.4"; // left,top,right,bottom around Kallakurichi region

export async function searchPlaces(query: string, signal?: AbortSignal): Promise<GeoPlace[]> {
  if (!query.trim()) return [];
  const url = new URL("https://nominatim.openstreetmap.org/search");
  url.searchParams.set("format", "json");
  url.searchParams.set("q", query);
  url.searchParams.set("limit", "6");
  url.searchParams.set("countrycodes", "in");
  url.searchParams.set("viewbox", VIEWBOX);
  url.searchParams.set("bounded", "0");
  url.searchParams.set("addressdetails", "0");

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
