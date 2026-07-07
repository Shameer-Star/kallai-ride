import { useEffect } from "react";
import { MapContainer, TileLayer, Marker, Polyline, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

// Default marker icon fix for Leaflet + bundlers
const pinIcon = (color: string) =>
  L.divIcon({
    className: "",
    html: `<div style="
      width:28px;height:28px;border-radius:50% 50% 50% 0;
      background:${color};transform:rotate(-45deg);
      border:3px solid white;box-shadow:0 2px 8px rgba(0,0,0,.3);
      display:flex;align-items:center;justify-content:center;">
      <div style="width:8px;height:8px;background:white;border-radius:50%;transform:rotate(45deg);"></div>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 28],
  });

const getCaptainIcon = (type: "bike" | "auto" = "bike") =>
  L.divIcon({
    className: "",
    html: `<div style="
      width:32px;height:32px;border-radius:8px;
      background:hsl(48 100% 50%);border:2px solid #111;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 8px rgba(0,0,0,.4);font-size:18px;">${type === "bike" ? "🏍️" : "🛺"}</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });

type Pt = { lat: number; lng: number };

function FitBounds({ points }: { points: Pt[] }) {
  const map = useMap();
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15);
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [60, 60] });
  }, [map, JSON.stringify(points)]);
  return null;
}

export function MapView({
  center,
  pickup,
  drop,
  captains = [],
  route,
}: {
  center: Pt;
  pickup?: Pt | null;
  drop?: Pt | null;
  captains?: { lat: number; lng: number; vehicle_type?: "bike" | "auto" }[];
  route?: [number, number][] | null;
}) {
  const fitPoints: Pt[] = [];
  if (pickup) fitPoints.push(pickup);
  if (drop) fitPoints.push(drop);
  if (!pickup && !drop) fitPoints.push(center);

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={14}
      scrollWheelZoom
      className="z-0"
      style={{ height: "100%", width: "100%" }}
    >
      <TileLayer
        attribution='&copy; OpenStreetMap'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pinIcon("hsl(48 100% 50%)")} />}
      {drop && <Marker position={[drop.lat, drop.lng]} icon={pinIcon("hsl(0 0% 8%)")} />}
      {captains.map((c, i) => (
        <Marker key={i} position={[c.lat, c.lng]} icon={getCaptainIcon(c.vehicle_type)} />
      ))}
      {route && route.length > 1 ? (
        <Polyline positions={route} pathOptions={{ color: "hsl(48, 100%, 45%)", weight: 5, opacity: 0.85 }} />
      ) : pickup && drop ? (
        <Polyline positions={[[pickup.lat, pickup.lng], [drop.lat, drop.lng]]} pathOptions={{ color: "hsl(48, 100%, 45%)", weight: 5, opacity: 0.85, dashArray: "5, 10" }} />
      ) : null}
      <FitBounds points={fitPoints} />
    </MapContainer>
  );
}
