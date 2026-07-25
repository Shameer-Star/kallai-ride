import { useEffect, useMemo, useState, useCallback } from "react";
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

// Customer location icon (for captain's view)
const customerLocationIcon = L.divIcon({
  className: "",
  html: `<div style="
    width:20px;height:20px;border-radius:50%;
    background:#34A853;border:3px solid white;
    box-shadow:0 2px 8px rgba(52,168,83,.5);
    animation: customerPulse 2s ease-in-out infinite;">
  </div>
  <div style="
    position:absolute;top:-5px;left:-5px;
    width:30px;height:30px;border-radius:50%;
    background:rgba(52,168,83,.15);
    animation: customerRipple 2s ease-in-out infinite;">
  </div>
  <style>
    @keyframes customerPulse {
      0%, 100% { transform: scale(1); }
      50% { transform: scale(1.1); }
    }
    @keyframes customerRipple {
      0% { transform: scale(0.8); opacity: 1; }
      100% { transform: scale(2); opacity: 0; }
    }
  </style>`,
  iconSize: [20, 20],
  iconAnchor: [10, 10],
});

type Pt = { lat: number; lng: number };

function FitBounds({ points }: { points: Pt[] }) {
  const map = useMap();
  const pointsKey = useMemo(
    () => points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|"),
    [points]
  );
  useEffect(() => {
    if (points.length === 0) return;
    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], 15, { animate: true, duration: 0.5 });
      return;
    }
    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]));
    map.fitBounds(bounds, { padding: [60, 60], animate: true, duration: 0.5 });
  }, [map, pointsKey]);
  return null;
}

// Locate Me button component
function LocateButton({ onLocate }: { onLocate?: () => void }) {
  const map = useMap();
  const handleLocate = useCallback(() => {
    if (onLocate) {
      onLocate();
      return;
    }
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        map.setView([pos.coords.latitude, pos.coords.longitude], 16, { animate: true });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 5000 }
    );
  }, [map, onLocate]);

  return (
    <div
      className="leaflet-bottom leaflet-right"
      style={{ marginBottom: "80px", marginRight: "10px" }}
    >
      <div className="leaflet-control">
        <button
          type="button"
          onClick={handleLocate}
          style={{
            width: "40px",
            height: "40px",
            background: "white",
            border: "2px solid rgba(0,0,0,0.2)",
            borderRadius: "8px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            boxShadow: "0 2px 6px rgba(0,0,0,0.15)",
            fontSize: "20px",
            transition: "all 0.2s ease",
          }}
          title="My Location"
          aria-label="Center map on my location"
        >
          📍
        </button>
      </div>
    </div>
  );
}

export function MapView({
  center,
  pickup,
  drop,
  captains = [],
  route,
  captainRoute,
  userLocation,
  customerLocation,
  onLocateMe,
}: {
  center: Pt;
  pickup?: Pt | null;
  drop?: Pt | null;
  captains?: { lat: number; lng: number; vehicle_type?: "bike" | "auto" }[];
  route?: [number, number][] | null;
  captainRoute?: [number, number][] | null;
  userLocation?: Pt | null;
  customerLocation?: Pt | null;
  onLocateMe?: () => void;
}) {
  const [tilesLoaded, setTilesLoaded] = useState(false);

  // Memoize captain markers to prevent flicker
  const memoizedCaptains = useMemo(
    () =>
      captains.map((c) => ({
        lat: Number(c.lat.toFixed(5)),
        lng: Number(c.lng.toFixed(5)),
        vehicle_type: c.vehicle_type,
      })),
    [captains.map((c) => `${c.lat.toFixed(4)},${c.lng.toFixed(4)},${c.vehicle_type}`).join("|")]
  );

  // Calculate fit points including captain during active ride
  const fitPoints: Pt[] = useMemo(() => {
    const pts: Pt[] = [];
    if (pickup) pts.push(pickup);
    if (drop) pts.push(drop);
    // Include first captain position (usually the assigned one during active ride)
    if (captains.length === 1 && (pickup || drop)) {
      pts.push({ lat: captains[0].lat, lng: captains[0].lng });
    }
    if (pts.length === 0) pts.push(center);
    return pts;
  }, [
    pickup?.lat, pickup?.lng,
    drop?.lat, drop?.lng,
    captains.length === 1 ? captains[0]?.lat : undefined,
    captains.length === 1 ? captains[0]?.lng : undefined,
    center.lat, center.lng,
  ]);

  return (
    <div style={{ height: "100%", width: "100%", position: "relative" }}>
      {/* Tile loading indicator */}
      {!tilesLoaded && (
        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%, -50%)",
            zIndex: 1000,
            background: "rgba(255,255,255,0.9)",
            padding: "8px 16px",
            borderRadius: "8px",
            fontSize: "12px",
            fontWeight: 600,
            color: "#666",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)",
          }}
        >
          Loading map...
        </div>
      )}
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={14}
        scrollWheelZoom
        className="z-0"
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://carto.com/">CARTO</a> &copy; <a href="https://osm.org/">OSM</a>'
          url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
          eventHandlers={{
            load: () => setTilesLoaded(true),
            tileerror: () => setTilesLoaded(true),
          }}
        />
        {/* User's blue dot */}
        {userLocation && (
          <Marker position={[userLocation.lat, userLocation.lng]} icon={userLocationIcon} />
        )}
        {/* Customer's green dot (visible on captain's map) */}
        {customerLocation && (
          <Marker position={[customerLocation.lat, customerLocation.lng]} icon={customerLocationIcon} />
        )}
        {pickup && <Marker position={[pickup.lat, pickup.lng]} icon={pinIcon("hsl(48 100% 50%)")} />}
        {drop && <Marker position={[drop.lat, drop.lng]} icon={pinIcon("hsl(0 0% 8%)")} />}
        {memoizedCaptains.map((c, i) => (
          <Marker key={`cap-${i}-${c.lat}-${c.lng}`} position={[c.lat, c.lng]} icon={getCaptainIcon(c.vehicle_type)} />
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
        <LocateButton onLocate={onLocateMe} />
      </MapContainer>
    </div>
  );
}
