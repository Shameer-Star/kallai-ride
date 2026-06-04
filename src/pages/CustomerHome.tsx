import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { MapView } from "@/components/MapView";
import { PlaceSearch } from "@/components/PlaceSearch";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { calcFare, FARE_CONFIG, haversineKm, MATCH_RADIUS_KM, VehicleType } from "@/lib/fare";
import { getRouteDistanceKm, reverseGeocode, GeoPlace } from "@/lib/geocode";
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
  const [route, setRoute] = useState<[number, number][] | null>(null);
  const [nearbyCaptains, setNearbyCaptains] = useState<Pt[]>([]);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [booking, setBooking] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rateRide, setRateRide] = useState<Ride | null>(null);
  const lastRideRef = useRef<{ id: string; status: string } | null>(null);

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
        setRoute(null);
        setDistanceKm(haversineKm(pickup.pt, drop.pt));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pickup, drop]);

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
      if (cancelled) return;
      const next = (data as Ride) ?? null;
      // Detect completion: had active ride, now gone
      const prev = lastRideRef.current;
      if (prev && !next && prev.status !== "completed" && prev.status !== "cancelled") {
        // Fetch the ride that just ended
        const { data: ended } = await supabase
          .from("rides")
          .select("*")
          .eq("id", prev.id)
          .maybeSingle();
        if (ended && (ended as any).status === "completed" && (ended as any).captain_id) {
          // Check if already rated
          const { data: existing } = await supabase
            .from("ratings")
            .select("id")
            .eq("ride_id", prev.id)
            .maybeSingle();
          if (!existing) setRateRide(ended as Ride);
        }
      }
      lastRideRef.current = next ? { id: next.id, status: next.status } : null;
      setActiveRide(next);
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
          captains={nearbyCaptains}
          route={route}
        />

        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pointer-events-none">
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border-2 max-h-[80vh] overflow-y-auto">
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
              />
            ) : (
              <ActiveRidePanel ride={activeRide} onCancelClick={() => setCancelOpen(true)} />
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

      {rideType === "parcel" && <ParcelForm value={parcel} onChange={setParcel} />}

      {pickup && drop && (
        <>
          <div className="grid grid-cols-2 gap-2">
            {(Object.keys(FARE_CONFIG) as VehicleType[]).map((v) => {
              const cfg = FARE_CONFIG[v];
              const f = distanceKm > 0 ? calcFare(v, distanceKm) + (rideType === "parcel" ? 10 : 0) : 0;
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
            {booking ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              `${rideType === "parcel" ? "Send Parcel" : `Book ${FARE_CONFIG[vehicle].label}`} · ₹${fare}`
            )}
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

function ActiveRidePanel({ ride, onCancelClick }: { ride: Ride; onCancelClick: () => void }) {
  const status = ride.status;
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
        <span className="text-sm text-muted-foreground">
          {ride.distance_km} km · {ride.vehicle_type}
          {ride.ride_type === "parcel" && " · 📦"}
        </span>
        <span className="font-bold text-lg">₹{ride.fare}</span>
      </div>

      {(status === "requested" || status === "accepted") && (
        <Button variant="outline" onClick={onCancelClick} className="w-full">
          <X className="h-4 w-4 mr-1" /> Cancel · ரத்து
        </Button>
      )}
    </div>
  );
}
