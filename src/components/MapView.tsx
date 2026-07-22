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
      width:36px;height:36px;border-radius:50%;
      background:hsl(48 100% 50%);border:3px solid #111;
      display:flex;align-items:center;justify-content:center;
      box-shadow:0 2px 12px rgba(0,0,0,.5);font-size:18px;
      animation: captainPulse 2s ease-in-out infinite;">
      ${type === "bike" ? "🏍️" : "🛺"}
    </div>
    <style>
      @keyframes captainPulse {
        0%, 100% { transform: scale(1); box-shadow: 0 2px 12px rgba(0,0,0,.5); }
        50% { transform: scale(1.15); box-shadow: 0 4px 20px rgba(255,204,0,.6); }
      }
    </style>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });

const userLocationIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:18px;height:18px;border-radius:50%;
    background:#4285F4;border:3px solid white;
    box-shadow:0 2px 8px rgba(66,133,244,.5);
    animation: userPulse 2s ease-in-out infinite;">
  </div>
  <div style="
    position:absolute;top:-6px;left:-6px;
    width:30px;height:30px;border-radius:50%;
    background:rgba(66,133,244,.15);
    animation: userRipple 2s ease-in-out infinite;">
  </div>
  <style>
    @keyframes userPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes userRipple {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
  </style>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
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
  captainRoute,
  userLocation,
}: {
  center: Pt;
  pickup?: Pt | null;
  drop?: Pt | null;
  captains?: { lat: number; lng: number; vehicle_type?: "bike" | "auto" }[];
  route?: [number, number][] | null;
  captainRoute?: [number, number][] | null;
  userLocation?: Pt | null;
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
      {/* User's blue dot */}
      {userLocation && (
        <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />
      )}
      {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pinIcon("hsl(48 100% 50%)")} />}
      {drop && <Marker position={[drop.lat, drop.lng]} icon={pinIcon("hsl(0 0% 8%)")} />}
      {captains.map((c, i) => (
        <Marker key={i} position={[c.lat, c.lng]} icon={getCaptainIcon(c.vehicle_type)} />
      ))}
      {/* Main route (pickup to drop) */}
      {route && route.length > 1 ? (
        <Polyline positions={route} pathOptions={{ color: "hsl(48, 100%, 45%)", weight: 5, opacity: 0.85 }} />
      ) : pickup && drop ? (
        <Polyline positions={[[pickup.lat, pickup.lng], [drop.lat, drop.lng]]} pathOptions={{ color: "hsl(48, 100%, 45%)", weight: 5, opacity: 0.85, dashArray: "5, 10" }} />
      ) : null}
      {/* Live captain route (captain to pickup/drop) */}
      {captainRoute && captainRoute.length > 1 && (
        <Polyline
          positions={captainRoute}
          pathOptions={{
            color: "#4285F4",
            weight: 4,
            opacity: 0.8,
            dashArray: "8, 12",
          }}
        />
      )}
      <FitBounds points={fitPoints} />
    </MapContainer>
  );
}
