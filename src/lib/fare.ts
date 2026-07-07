// Fare configuration for Adhaiyu Ride (rural Tamil Nadu)
export type VehicleType = "bike" | "auto";

export const FARE_CONFIG: Record<VehicleType, { base: number; perKm: number; label: string; labelTa: string }> = {
  bike: { base: 10, perKm: 10, label: "Bike", labelTa: "பைக்" },
  auto: { base: 15, perKm: 15, label: "Auto", labelTa: "ஆட்டோ" },
};

export const MATCH_RADIUS_KM = 5;

export function calcFare(vehicle: VehicleType, distanceKm: number): number {
  const cfg = FARE_CONFIG[vehicle];
  const fare = cfg.base + cfg.perKm * Math.max(0, distanceKm);
  return Math.round(fare);
}

// Haversine distance in km
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number }
): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
