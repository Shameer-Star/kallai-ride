import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MapView } from "@/components/MapView";
import { PlaceSearch } from "@/components/PlaceSearch";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calcFare, FARE_CONFIG, haversineKm, MATCH_RADIUS_KM, VehicleType } from "@/lib/fare";
import { getRouteDistanceKm, reverseGeocode, GeoPlace, LOCAL_PLACES } from "@/lib/geocode";
import { playNotificationSound } from "@/lib/alertSound";
import { Bike, Car, Loader2, MapPin, X, CheckCircle2, Package, Users, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { CancellationDialog } from "@/components/CancellationDialog";
import { ParcelForm, ParcelDetails, isParcelValid } from "@/components/ParcelForm";
import { DriverCard } from "@/components/DriverCard";
import { RatingDialog } from "@/components/RatingDialog";
import { FavoriteLocations, FavoriteLocation } from "@/components/FavoriteLocations";

type Pt = { lat: number; lng: number };
type RideType = "passenger" | "parcel";
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
  ride_type: RideType;
  otp: string | null;
};

const DEFAULT_CENTER: Pt = { lat: 11.7401, lng: 78.9609 };
const EMPTY_PARCEL: ParcelDetails = {
  sender_name: "",
  sender_phone: "",
  receiver_name: "",
  receiver_phone: "",
  item_description: "",
};

export default function CustomerHome() {
  const { user } = useAuth();
  const [center, setCenter] = useState<Pt>(DEFAULT_CENTER);
  const [pickup, setPickup] = useState<{ pt: Pt; address: string } | null>(null);
  const [drop, setDrop] = useState<{ pt: Pt; address: string } | null>(null);
  const [vehicle, setVehicle] = useState<VehicleType>("bike");
  const [rideType, setRideType] = useState<RideType>("passenger");
  const [parcel, setParcel] = useState<ParcelDetails>(EMPTY_PARCEL);
  const [distanceKm, setDistanceKm] = useState<number>(0);
  const [durationSec, setDurationSec] = useState<number>(0);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [nearbyCaptains, setNearbyCaptains] = useState<Pt[]>([]);
  const [captainLive, setCaptainLive] = useState<Pt | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [booking, setBooking] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateRide, setRateRide] = useState<Ride | null>(null);
  const [userLocation, setUserLocation] = useState<Pt | null>(null);
  const [liveDurationSec, setLiveDurationSec] = useState<number | null>(null);
  const [liveRouteDistKm, setLiveRouteDistKm] = useState<number | null>(null);
  const lastFetchedTime = useRef<number>(0);
  const lastRideRef = useRef<{ id: string; status: string } | null>(null);

  // Watch user location continuously
  useEffect(() => {
    if (!navigator.geolocation) {
      toast.error("Geolocation is not supported by your browser");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserLocation(pt);
        setPickup((prev) => {
          if (!prev) {
            setCenter(pt);
            reverseGeocode(pt.lat, pt.lng).then((addr) => {
              setPickup({ pt, address: addr });
            });
          }
          return prev;
        });
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location permission denied. Please enable GPS access in browser settings.");
        } else {
          console.warn("Geolocation watch error:", err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  // Fetch route and distance/duration
  useEffect(() => {
    if (!pickup || !drop) {
      setRoute(null);
      setDistanceKm(0);
      setDurationSec(0);
      return;
    }
    let cancelled = false;
    setCalculatingRoute(true);
    (async () => {
      const r = await getRouteDistanceKm(pickup.pt, drop.pt);
      if (cancelled) return;
      if (r) {
        setRoute(r.geometry);
        setDistanceKm(r.distanceKm);
        setDurationSec(r.durationSec);
      } else {
        setRoute(null);
        const dist = haversineKm(pickup.pt, drop.pt);
        setDistanceKm(dist);
        setDurationSec((dist / 25) * 3600); // 25 km/h fallback
      }
      setCalculatingRoute(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, drop]);

  useEffect(() => {
    if (!pickup) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.rpc("get_nearby_captains" as any, {
        _vehicle: vehicle,
        _lat: pickup!.pt.lat,
        _lng: pickup!.pt.lng,
        _radius_km: MATCH_RADIUS_KM,
      });
      if (cancelled || !data) return;
      const pts: Pt[] = (data as any[])
        .filter((c) => c.current_lat != null && c.current_lng != null && c.is_online === true)
        .map((c) => ({ lat: Number(c.current_lat), lng: Number(c.current_lng) }));
      setNearbyCaptains(pts);
    }
    load();
    // Poll every 8s for nearby captains while not on an active ride
    const id = window.setInterval(load, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [pickup, vehicle]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    const RIDE_COLS =
      "id, status, captain_id, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, fare, distance_km, vehicle_type, ride_type, created_at";
    async function load() {
      const { data } = await supabase
        .from("rides")
        .select(RIDE_COLS)
        .eq("customer_id", user!.id)
        .in("status", ["requested", "accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      let next = (data as unknown as Ride) ?? null;

      // Auto cancel if requested more than 20 minutes ago and no captain accepted
      if (next && next.status === "requested" && (next as any).created_at) {
        const elapsed = Date.now() - new Date((next as any).created_at).getTime();
        if (elapsed > 20 * 60 * 1000) {
          await supabase
            .from("rides")
            .update({
              status: "cancelled",
              cancellation_reason: "Timeout: No captain accepted the ride within 20 minutes",
              cancelled_by: user!.id
            })
            .eq("id", next.id);
          toast.warning("Booking timed out: No captain accepted your ride in 20 minutes.");
          next = null;
        }
      }

      // Fetch OTP separately via RPC when ride is accepted (otp column not exposed in base table)
      if (next && next.status === "accepted" && next.captain_id) {
        const { data: otpData } = await supabase.rpc("get_my_ride_otp" as any, { _ride_id: next.id });
        if (otpData) next = { ...next, otp: otpData as string };
      }
      // Detect completion
      const prev = lastRideRef.current;
      if (prev && !next && prev.status !== "completed" && prev.status !== "cancelled") {
        const { data: ended } = await supabase
          .from("rides")
          .select(RIDE_COLS)
          .eq("id", prev.id)
          .maybeSingle();
        if (ended && (ended as any).status === "completed" && (ended as any).captain_id) {
          const { data: existing } = await supabase
            .from("ratings")
            .select("id")
            .eq("ride_id", prev.id)
            .maybeSingle();
          if (!existing) setRateRide(ended as unknown as Ride);
        }
      }
      lastRideRef.current = next ? { id: next.id, status: next.status } : null;
      setActiveRide(next);
    }
    load();
    const channel = supabase
      .channel(`customer-feed-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "rides", filter: `customer_id=eq.${user.id}` },
        () => load()
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          load();
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user]);

  // Live captain tracking: subscribe to assigned captain's location (Postgres & Broadcast)
  useEffect(() => {
    const capId = activeRide?.captain_id;
    const status = activeRide?.status;
    if (!capId || (status !== "accepted" && status !== "started")) {
      setCaptainLive(null);
      return;
    }
    let cancelled = false;
    async function load() {
      const { data } = await supabase
        .from("captains")
        .select("current_lat, current_lng")
        .eq("id", capId)
        .maybeSingle();
      if (cancelled || !data) return;
      if (data.current_lat != null && data.current_lng != null) {
        setCaptainLive({ lat: Number(data.current_lat), lng: Number(data.current_lng) });
      }
    }
    load();
    const channel = supabase
      .channel(`captain-live-${capId}`)
      .on("broadcast", { event: "location" }, (payload: any) => {
        const { lat, lng } = payload.payload;
        if (lat != null && lng != null) {
          setCaptainLive({ lat, lng });
        }
      })
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "captains", filter: `id=eq.${capId}` },
        (payload: any) => {
          const r = payload.new;
          if (r?.current_lat != null && r?.current_lng != null) {
            setCaptainLive({ lat: Number(r.current_lat), lng: Number(r.current_lng) });
          }
        }
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [activeRide?.captain_id, activeRide?.status]);

  // Dynamically update active ride duration ETA from OSRM
  useEffect(() => {
    const target =
      activeRide?.status === "accepted"
        ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng }
        : activeRide?.status === "started"
        ? { lat: activeRide.drop_lat, lng: activeRide.drop_lng }
        : null;

    if (!captainLive || !target || !activeRide) {
      setLiveDurationSec(null);
      return;
    }

    const now = Date.now();
    // Fetch OSRM duration at most once every 15 seconds to avoid rate limiting
    if (now - lastFetchedTime.current < 15000) return;

    let cancelled = false;
    (async () => {
      lastFetchedTime.current = now;
      const r = await getRouteDistanceKm(captainLive, target);
      if (cancelled) return;
      if (r) {
        if (r.durationSec != null) setLiveDurationSec(r.durationSec);
        if (r.distanceKm != null) setLiveRouteDistKm(r.distanceKm);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [captainLive, activeRide?.id, activeRide?.status]);

  const fare = useMemo(() => {
    if (distanceKm <= 0) return 0;
    const base = calcFare(vehicle, distanceKm);
    return rideType === "parcel" ? base + 10 : base;
  }, [vehicle, distanceKm, rideType]);

  async function bookRide() {
    if (!user || !pickup || !drop || distanceKm === 0) return;
    if (rideType === "parcel" && !isParcelValid(parcel)) {
      toast.error("Please fill all parcel details (10-digit phone numbers)");
      return;
    }
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
          ride_type: rideType,
          distance_km: Number(distanceKm.toFixed(2)),
          fare,
          status: "requested",
          ...(rideType === "parcel" ? parcel : {}),
        })
        .select()
        .single();
      if (error) throw error;
      setActiveRide(data as Ride);
      toast.success(rideType === "parcel" ? "Searching for captain to pick up parcel..." : "Searching for nearby captain...");
    } catch (err: any) {
      toast.error(err.message ?? "Failed to book ride");
    } finally {
      setBooking(false);
    }
  }

  async function increaseFare(increment: number) {
    if (!activeRide) return;
    const newFare = Number(activeRide.fare) + increment;
    
    const { error: updateError } = await supabase
      .from("rides")
      .update({
        fare: newFare,
        rejected_by: [] // Reset rejected_by to allow skipped captains to see it again
      })
      .eq("id", activeRide.id);

    if (updateError) {
      toast.error(updateError.message);
      return;
    }

    try {
      const { data: captainsData } = await supabase.rpc("get_nearby_captains" as any, {
        _vehicle: activeRide.vehicle_type,
        _lat: activeRide.pickup_lat,
        _lng: activeRide.pickup_lng,
        _radius_km: 5.0,
      });

      if (captainsData && Array.isArray(captainsData)) {
        const notifs = captainsData.map((cap: any) => ({
          user_id: cap.id,
          title: "Fare Increased! ₹" + newFare,
          body: `The ride request fare near your location has been increased to ₹${newFare}.`,
          type: "fare_increase",
        }));
        if (notifs.length > 0) {
          await (supabase.from("notifications" as any)).insert(notifs as any);
        }
      }
    } catch (err) {
      console.error("Failed to notify captains of fare increase:", err);
    }

    setActiveRide({
      ...activeRide,
      fare: newFare,
    });
    toast.success(`Fare increased by ₹${increment}! Captains notified.`);
  }

  async function confirmCancel(reason: string) {
    if (!activeRide || !user) return;
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled", cancellation_reason: reason, cancelled_by: user.id })
      .eq("id", activeRide.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("cancellations").insert({
      ride_id: activeRide.id,
      cancelled_by: user.id,
      cancelled_by_role: "customer",
      reason,
    });
    setCancelOpen(false);
    setActiveRide(null);
    toast.success("Ride cancelled");
  }

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="relative flex-1">
        <MapView
          center={pickup?.pt ?? center}
          pickup={pickup?.pt}
          drop={drop?.pt}
          captains={
            activeRide && captainLive
              ? [{ ...captainLive, vehicle_type: activeRide.vehicle_type }]
              : activeRide
              ? []
              : nearbyCaptains.map((pt) => ({ ...pt, vehicle_type: vehicle }))
          }
          route={route}
        />

        <div className="absolute bottom-0 left-0 right-0 md:top-3 md:bottom-3 md:right-auto md:w-[420px] z-10 p-3 pointer-events-none">
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border-2 max-h-[80vh] md:max-h-full md:h-full overflow-y-auto glass-panel">
            {!activeRide ? (
              <BookingPanel
                pickup={pickup}
                drop={drop}
                onPickup={(p) => setPickup({ pt: { lat: p.lat, lng: p.lng }, address: p.display_name })}
                onDrop={(p) => setDrop({ pt: { lat: p.lat, lng: p.lng }, address: p.display_name })}
                onSelectFavorite={(f) =>
                  setDrop({ pt: { lat: f.lat, lng: f.lng }, address: f.address })
                }
                vehicle={vehicle}
                setVehicle={setVehicle}
                rideType={rideType}
                setRideType={setRideType}
                parcel={parcel}
                setParcel={setParcel}
                distanceKm={distanceKm}
                fare={fare}
                nearbyCount={nearbyCaptains.length}
                booking={booking}
                onBook={bookRide}
                durationSec={durationSec}
                calculatingRoute={calculatingRoute}
              />
            ) : (
              <ActiveRidePanel
                ride={activeRide}
                captainLive={captainLive}
                onCancelClick={() => setCancelOpen(true)}
                onIncreaseFare={increaseFare}
                liveDurationSec={liveDurationSec}
                liveRouteDistKm={liveRouteDistKm}
              />
            )}
          </Card>
        </div>

        <CancellationDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          role="customer"
          onConfirm={confirmCancel}
        />

        {rateRide && user && rateRide.captain_id && (
          <RatingDialog
            open={!!rateRide}
            onOpenChange={(v) => !v && setRateRide(null)}
            rideId={rateRide.id}
            customerId={user.id}
            captainId={rateRide.captain_id}
            fare={rateRide.fare}
          />
        )}
      </div>
    </div>
  );
}

function BookingPanel({
  pickup,
  drop,
  onPickup,
  onDrop,
  onSelectFavorite,
  vehicle,
  setVehicle,
  rideType,
  setRideType,
  parcel,
  setParcel,
  distanceKm,
  fare,
  nearbyCount,
  booking,
  onBook,
  durationSec,
  calculatingRoute,
}: {
  pickup: { pt: Pt; address: string } | null;
  drop: { pt: Pt; address: string } | null;
  onPickup: (p: GeoPlace) => void;
  onDrop: (p: GeoPlace) => void;
  onSelectFavorite: (f: FavoriteLocation) => void;
  vehicle: VehicleType;
  setVehicle: (v: VehicleType) => void;
  rideType: RideType;
  setRideType: (v: RideType) => void;
  parcel: ParcelDetails;
  setParcel: (p: ParcelDetails) => void;
  distanceKm: number;
  fare: number;
  nearbyCount: number;
  booking: boolean;
  onBook: () => void;
  durationSec: number;
  calculatingRoute: boolean;
}) {
  return (
    <div className="space-y-3">
      {/* Service type tabs */}
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setRideType("passenger")}
          className={`p-2 rounded-xl border-2 text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
            rideType === "passenger" ? "border-primary bg-primary/10" : "border-border"
          }`}
        >
          <Users className="h-4 w-4" /> Ride
        </button>
        <button
          type="button"
          onClick={() => setRideType("parcel")}
          className={`p-2 rounded-xl border-2 text-sm font-semibold transition-all flex items-center justify-center gap-1 ${
            rideType === "parcel" ? "border-primary bg-primary/10" : "border-border"
          }`}
        >
          <Package className="h-4 w-4" /> Parcel
        </button>
      </div>

      <div className="space-y-2">
        <PlaceSearch
          placeholder={rideType === "parcel" ? "Pickup parcel from" : "Pickup location · ஏறும் இடம்"}
          value={pickup?.address ?? ""}
          onSelect={onPickup}
          iconColor="hsl(48 100% 50%)"
        />
        <PlaceSearch
          placeholder={rideType === "parcel" ? "Deliver parcel to" : "Drop location · இறங்கும் இடம்"}
          value={drop?.address ?? ""}
          onSelect={onDrop}
          iconColor="hsl(0 0% 8%)"
        />
      </div>

      <FavoriteLocations currentPickup={pickup} onSelect={onSelectFavorite} />

      {/* Quick locations */}
      <div className="space-y-1.5 bg-muted/40 p-2.5 rounded-xl border border-dashed text-xs">
        <div className="font-semibold text-muted-foreground flex items-center gap-1 mb-1">
          <span>Quick Locations · விரைவு இடங்கள்:</span>
        </div>
        
        <div className="space-y-1">
          <div className="text-[10px] text-muted-foreground font-medium">Pickup (ஏறும் இடம்):</div>
          <div className="flex gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            {LOCAL_PLACES.map((p) => {
              const name = p.display_name.split(",")[0];
              return (
                <button
                  key={`quick-pickup-${name}`}
                  type="button"
                  onClick={() => onPickup(p)}
                  className="shrink-0 text-[10px] bg-card hover:bg-primary hover:text-primary-foreground border px-2.5 py-1 rounded-full transition-all font-medium"
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-1 mt-1">
          <div className="text-[10px] text-muted-foreground font-medium">Drop (இறங்கும் இடம்):</div>
          <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
            {LOCAL_PLACES.map((p) => {
              const name = p.display_name.split(",")[0];
              return (
                <button
                  key={`quick-drop-${name}`}
                  type="button"
                  onClick={() => onDrop(p)}
                  className="shrink-0 text-[10px] bg-card hover:bg-primary hover:text-primary-foreground border px-2.5 py-1 rounded-full transition-all font-medium"
                >
                  {name}
                </button>
              );
            })}
          </div>
        </div>
      </div>


      {rideType === "parcel" && <ParcelForm value={parcel} onChange={setParcel} />}

      {pickup && drop && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FARE_CONFIG) as VehicleType[]).map((v) => {
              const cfg = FARE_CONFIG[v];
              const f = distanceKm > 0 ? calcFare(v, distanceKm) + (rideType === "parcel" ? 10 : 0) : 0;
              const emoji = v === "bike" ? "🏍️" : "🛺";
              return (
                <button
                  key={v}
                  type="button"
                  onClick={() => setVehicle(v)}
                  className={`p-3 rounded-xl border-2 text-left transition-all relative overflow-hidden hover-lift ${
                    vehicle === v ? "border-primary bg-primary/10 shadow-sm" : "border-border"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-2xl">{emoji}</span>
                    <span className="font-extrabold text-base">₹{f}</span>
                  </div>
                  <div className="mt-2 text-sm font-bold">{cfg.label}</div>
                  <div className="text-[10px] text-muted-foreground">{cfg.labelTa}</div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {distanceKm.toFixed(1)} km 
              {durationSec > 0 && ` (~${Math.round(durationSec / 60)} mins)`} · {nearbyCount} captain{nearbyCount === 1 ? "" : "s"} nearby
            </span>
            <span>Estimated · ₹{fare}</span>
          </div>

          {calculatingRoute ? (
            <Button disabled className="w-full h-12 font-bold text-base">
              <Loader2 className="h-4 w-4 animate-spin mr-2" /> Calculating Fare & Route...
            </Button>
          ) : (
            <Button onClick={onBook} disabled={booking || distanceKm === 0} className="w-full h-12 font-bold text-base glow-button">
              {booking ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                `${rideType === "parcel" ? "Send Parcel" : `Book ${FARE_CONFIG[vehicle].label}`} · ₹${fare}`
              )}
            </Button>
          )}
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

function ActiveRidePanel({
  ride,
  captainLive,
  onCancelClick,
  onIncreaseFare,
  liveDurationSec,
  liveRouteDistKm,
}: {
  ride: Ride;
  captainLive: Pt | null;
  onCancelClick: () => void;
  onIncreaseFare?: (amount: number) => void;
  liveDurationSec: number | null;
  liveRouteDistKm: number | null;
}) {
  const status = ride.status;
  const liveTarget: Pt | null =
    status === "accepted"
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng }
      : status === "started"
      ? { lat: ride.drop_lat, lng: ride.drop_lng }
      : null;
  const liveDistKm = liveRouteDistKm != null ? liveRouteDistKm : (captainLive && liveTarget ? haversineKm(captainLive, liveTarget) : null);
  const etaMin = liveDurationSec != null
    ? Math.max(1, Math.round(liveDurationSec / 60))
    : liveDistKm != null
    ? Math.max(1, Math.round((liveDistKm / 25) * 60))
    : null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        {status === "requested" && (
          <>
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
            <div>
              <div className="font-bold">
                {ride.ride_type === "parcel" ? "Searching for delivery captain..." : "Searching for captain..."}
              </div>
              <div className="text-xs text-muted-foreground">கேப்டனைத் தேடுகிறோம்</div>
            </div>
          </>
        )}
        {status === "accepted" && (
          <div>
            <div className="font-bold flex items-center gap-1">
              <CheckCircle2 className="h-5 w-5 text-primary" /> Captain accepted!
            </div>
            <div className="text-xs text-muted-foreground">கேப்டன் வருகிறார்</div>
          </div>
        )}
        {status === "started" && (
          <>
            <MapPin className="h-6 w-6 text-primary" />
            <div>
              <div className="font-bold">
                {ride.ride_type === "parcel" ? "Parcel on the way" : "Ride in progress"}
              </div>
              <div className="text-xs text-muted-foreground">
                {ride.ride_type === "parcel" ? "பார்சல் வருகிறது" : "சவாரி நடக்கிறது"}
              </div>
            </div>
          </>
        )}
      </div>

      {etaMin != null && (
        <div className="flex items-center justify-between bg-primary/10 border border-primary/30 rounded-xl p-3">
          <div className="text-sm">
            <div className="font-bold">
              {status === "accepted" ? "Captain arriving in" : "Reaching drop in"}
            </div>
            <div className="text-xs text-muted-foreground">
              {liveDistKm!.toFixed(1)} km away · live tracking
            </div>
          </div>
          <div className="text-2xl font-extrabold text-primary">{etaMin} min</div>
        </div>
      )}

      {/* Captain details */}
      {ride.captain_id && (status === "accepted" || status === "started") && (
        <DriverCard captainId={ride.captain_id} />
      )}

      {/* OTP shown to customer when accepted */}
      {status === "accepted" && ride.otp && (
        <div className="bg-primary/10 border-2 border-primary/30 rounded-xl p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-xs text-muted-foreground">
            <KeyRound className="h-3 w-3" /> Share this OTP with captain
          </div>
          <div className="text-3xl font-extrabold tracking-[0.5em] text-primary mt-1">{ride.otp}</div>
          <div className="text-[10px] text-muted-foreground">OTP-ஐ கேப்டனிடம் சொல்லவும்</div>
        </div>
      )}

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
        <span className="text-sm text-muted-foreground flex items-center gap-1">
          <span>{ride.vehicle_type === "bike" ? "🏍️" : "🛺"}</span>
          <span className="capitalize">{ride.vehicle_type}</span> · {ride.distance_km} km
          {ride.ride_type === "parcel" && " · 📦"}
        </span>
        <span className="font-bold text-lg">₹{ride.fare}</span>
      </div>

      {status === "requested" && (
        <div className="bg-primary/5 border border-primary/20 rounded-xl p-3 space-y-2">
          <div className="text-xs font-bold text-center text-primary flex flex-col gap-0.5">
            <span>Increase fare to find captain faster:</span>
            <span className="text-[10px] font-normal text-muted-foreground">(ஆஃபர் தொகையை உயர்த்தவும்)</span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {[10, 20, 30, 40, 50].map((inc) => (
              <button
                key={inc}
                type="button"
                onClick={() => onIncreaseFare?.(inc)}
                className="bg-primary text-primary-foreground hover:bg-primary/95 py-2 px-1 rounded-lg text-xs font-bold transition-all shadow-sm active:scale-95"
              >
                +₹{inc}
              </button>
            ))}
          </div>
        </div>
      )}

      {(status === "requested" || status === "accepted") && (
        <Button variant="outline" onClick={onCancelClick} className="w-full">
          <X className="h-4 w-4 mr-1" /> {status === "accepted" ? "Cancel Driver · கேப்டனை ரத்து செய்" : "Cancel Ride · ரத்து செய்"}
        </Button>
      )}
    </div>
  );
}
