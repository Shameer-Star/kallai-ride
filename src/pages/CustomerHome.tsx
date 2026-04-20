import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MapView } from "@/components/MapView";
import { PlaceSearch } from "@/components/PlaceSearch";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calcFare, FARE_CONFIG, haversineKm, MATCH_RADIUS_KM, VehicleType } from "@/lib/fare";
import { getRouteDistanceKm, reverseGeocode, GeoPlace } from "@/lib/geocode";
import { Bike, Car, Loader2, MapPin, X, Phone, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";

type Pt = { lat: number; lng: number };
type Ride = {
  id: string;
  status: "requested" | "accepted" | "started" | "completed" | "cancelled";
  captain_id: string | null;
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  fare: number;
  distance_km: number;
  vehicle_type: VehicleType;
};

const DEFAULT_CENTER: Pt = { lat: 11.7401, lng: 78.9609 }; // Kallakurichi area

export default function CustomerHome() {
  const { user } = useAuth();
  const [center, setCenter] = useState<Pt>(DEFAULT_CENTER);
  const [pickup, setPickup] = useState<{ pt: Pt; address: string } | null>(null);
  const [drop, setDrop] = useState<{ pt: Pt; address: string } | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>("bike");
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [nearbyCaptains, setNearbyCaptains] = useState<Pt[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [booking, setBooking] = useState(false);

  // Get user GPS once on load
  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(pt);
        const addr = await reverseGeocode(pt.lat, pt.lng);
        setPickup({ pt, address: addr });
      },
      () => {},
      { enableHighAccuracy: true, timeout: 8000 }
    );
  }, []);

  // Compute route + distance whenever pickup/drop change
  useEffect(() => {
    if (!pickup || !drop) {
      setRoute(null);
      setDistanceKm(0);
      return;
    }
    let cancelled = false;
    (async () => {
      const r = await getRouteDistanceKm(pickup.pt, drop.pt);
      if (cancelled) return;
      if (r) {
        setRoute(r.geometry);
        setDistanceKm(r.distanceKm);
      } else {
        // fallback haversine
        setRoute(null);
        setDistanceKm(haversineKm(pickup.pt, drop.pt));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, drop]);

  // Fetch nearby online captains for the chosen vehicle
  useEffect(() => {
    if (!pickup) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("captains")
        .select("current_lat, current_lng, vehicle_type, is_online")
        .eq("is_online", true)
        .eq("vehicle_type", vehicle);
      if (cancelled || !data) return;
      const pts: Pt[] = data
        .filter((c: any) => c.current_lat != null && c.current_lng != null)
        .map((c: any) => ({ lat: c.current_lat, lng: c.current_lng }))
        .filter((p) => haversineKm(pickup!.pt, p) <= MATCH_RADIUS_KM);
      setNearbyCaptains(pts);
    }
    load();
    const channel = supabase
      .channel("captains-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, load)
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [pickup, vehicle]);

  // Watch active ride for status updates
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("rides")
        .select("*")
        .eq("customer_id", user!.id)
        .in("status", ["requested", "accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setActiveRide((data as Ride) ?? null);
    }
    load();
    const channel = supabase
      .channel(`customer-rides-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides", filter: `customer_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  const fare = useMemo(() => (distanceKm > 0 ? calcFare(vehicle, distanceKm) : 0), [vehicle, distanceKm]);

  async function bookRide() {
    if (!user || !pickup || !drop || distanceKm === 0) return;
    setBooking(true);
    try {
      const { data, error } = await supabase
        .from("rides")
        .insert({
          customer_id: user.id,
          pickup_address: pickup.address,
          pickup_lat: pickup.pt.lat,
          pickup_lng: pickup.pt.lng,
          drop_address: drop.address,
          drop_lat: drop.pt.lat,
          drop_lng: drop.pt.lng,
          vehicle_type: vehicle,
          distance_km: Number(distanceKm.toFixed(2)),
          fare,
          status: "requested",
        })
        .select()
        .single();
      if (error) throw error;
      setActiveRide(data as Ride);
      toast.success("Searching for nearby captain...");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to book ride");
    } finally {
      setBooking(false);
    }
  }

  async function cancelRide() {
    if (!activeRide) return;
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled" })
      .eq("id", activeRide.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Ride cancelled");
      setActiveRide(null);
    }
  }

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="relative flex-1">
        <MapView
          center={pickup?.pt ?? center}
          pickup={pickup?.pt}
          drop={drop?.pt}
          captains={nearbyCaptains}
          route={route}
        />

        {/* Bottom sheet — booking or active ride */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pointer-events-none">
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border-2">
            {!activeRide ? (
              <BookingPanel
                pickup={pickup}
                drop={drop}
                onPickup={(p) => setPickup({ pt: { lat: p.lat, lng: p.lng }, address: p.display_name })}
                onDrop={(p) => setDrop({ pt: { lat: p.lat, lng: p.lng }, address: p.display_name })}
                vehicle={vehicle}
                setVehicle={setVehicle}
                distanceKm={distanceKm}
                fare={fare}
                nearbyCount={nearbyCaptains.length}
                booking={booking}
                onBook={bookRide}
              />
            ) : (
              <ActiveRidePanel ride={activeRide} onCancel={cancelRide} />
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

function BookingPanel({
  pickup,
  drop,
  onPickup,
  onDrop,
  vehicle,
  setVehicle,
  distanceKm,
  fare,
  nearbyCount,
  booking,
  onBook,
}: {
  pickup: { pt: Pt; address: string } | null;
  drop: { pt: Pt; address: string } | null;
  onPickup: (p: GeoPlace) => void;
  onDrop: (p: GeoPlace) => void;
  vehicle: VehicleType;
  setVehicle: (v: VehicleType) => void;
  distanceKm: number;
  fare: number;
  nearbyCount: number;
  booking: boolean;
  onBook: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        <PlaceSearch
          placeholder="Pickup location · ஏறும் இடம்"
          value={pickup?.address ?? ""}
          onSelect={onPickup}
          iconColor="hsl(48 100% 50%)"
        />
        <PlaceSearch
          placeholder="Drop location · இறங்கும் இடம்"
          value={drop?.address ?? ""}
          onSelect={onDrop}
          iconColor="hsl(0 0% 8%)"
        />
      </div>

      {pickup && drop && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FARE_CONFIG) as VehicleType[]).map((v) => {
              const cfg = FARE_CONFIG[v];
              const f = distanceKm > 0 ? calcFare(v, distanceKm) : 0;
              const Icon = v === "bike" ? Bike : Car;
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVehicle(v)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    vehicle === v ? "border-primary bg-primary/10" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <Icon className="h-5 w-5" />
                    <span className="font-bold">₹{f}</span>
                  </div>
                  <div className="mt-1 text-sm font-semibold">{cfg.label}</div>
                  <div className="text-[11px] text-muted-foreground">{cfg.labelTa}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{distanceKm.toFixed(1)} km · {nearbyCount} captain{nearbyCount === 1 ? "" : "s"} nearby</span>
            <span>Estimated · ₹{fare}</span>
          </div>

          <Button onClick={onBook} disabled={booking || distanceKm === 0} className="w-full h-12 font-bold text-base">
            {booking ? <Loader2 className="h-4 w-4 animate-spin" /> : `Book ${FARE_CONFIG[vehicle].label} · ₹${fare}`}
          </Button>
        </>
      )}

      {(!pickup || !drop) && (
        <p className="text-xs text-muted-foreground text-center py-2">
          {!pickup ? "Set pickup location" : "Set drop location"} to see fare
        </p>
      )}
    </div>
  );
}

function ActiveRidePanel({ ride, onCancel }: { ride: Ride; onCancel: () => void }) {
  const status = ride.status;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {status === "requested" && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <div className="font-bold">Searching for captain...</div>
              <div className="text-xs text-muted-foreground">கேப்டனைத் தேடுகிறோம்</div>
            </div>
          </>
        )}
        {status === "accepted" && (
          <>
            <Phone className="h-6 w-6 text-primary" />
            <div>
              <div className="font-bold">Captain on the way!</div>
              <div className="text-xs text-muted-foreground">கேப்டன் வருகிறார்</div>
            </div>
          </>
        )}
        {status === "started" && (
          <>
            <MapPin className="h-6 w-6 text-primary" />
            <div>
              <div className="font-bold">Ride in progress</div>
              <div className="text-xs text-muted-foreground">சவாரி நடக்கிறது</div>
            </div>
          </>
        )}
      </div>

      <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <span className="line-clamp-1">{ride.pickup_address}</span>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-secondary mt-1.5 shrink-0" />
          <span className="line-clamp-1">{ride.drop_address}</span>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{ride.distance_km} km · {ride.vehicle_type}</span>
        <span className="font-bold text-lg">₹{ride.fare}</span>
      </div>

      {(status === "requested" || status === "accepted") && (
        <Button variant="outline" onClick={onCancel} className="w-full">
          <X className="h-4 w-4 mr-1" /> Cancel · ரத்து
        </Button>
      )}
    </div>
  );
}
