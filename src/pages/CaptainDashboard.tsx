import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { MapView } from "@/components/MapView";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { calcFare, haversineKm, MATCH_RADIUS_KM, VehicleType } from "@/lib/fare";
import {
  CheckCircle2,
  IndianRupee,
  Navigation,
  Upload,
  X,
  Package,
  Star,
  AlertTriangle,
  KeyRound,
} from "lucide-react";
import { toast } from "sonner";
import { startAlertLoop, stopAlertLoop } from "@/lib/alertSound";
import { CancellationDialog } from "@/components/CancellationDialog";
import { OtpInput } from "@/components/OtpInput";
import { CustomerCard } from "@/components/CustomerCard";
import { EarningsBreakdown } from "@/components/EarningsBreakdown";
import { LoadingSpinner } from "@/components/LoadingSpinner";

type Pt = { lat: number; lng: number };
type Captain = {
  id: string;
  full_name: string | null;
  phone: string | null;
  upi_id: string | null;
  vehicle_type: VehicleType;
  vehicle_number: string | null;
  license_number: string | null;
  license_url: string | null;
  rc_url: string | null;
  photo_url: string | null;
  verified: boolean;
  is_online: boolean;
  current_lat: number | null;
  current_lng: number | null;
  rating: number;
  total_rides: number;
  completed_rides: number;
  cancelled_rides: number;
  daily_cancel_count: number;
  daily_cancel_date: string | null;
  warning_level: number;
};
type Ride = {
  id: string;
  customer_id: string;
  captain_id: string | null;
  status: "requested" | "accepted" | "started" | "completed" | "cancelled";
  pickup_address: string;
  pickup_lat: number;
  pickup_lng: number;
  drop_address: string;
  drop_lat: number;
  drop_lng: number;
  vehicle_type: VehicleType;
  ride_type: "passenger" | "parcel";
  fare: number;
  distance_km: number;
  rejected_by: string[];
  otp: string | null;
  sender_name: string | null;
  sender_phone: string | null;
  receiver_name: string | null;
  receiver_phone: string | null;
  item_description: string | null;
};

const DEFAULT_CENTER: Pt = { lat: 11.7401, lng: 78.9609 };
const ALERT_TIMEOUT_SEC = 60;

export default function CaptainDashboard() {
  const { user } = useAuth();
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [center, setCenter] = useState<Pt>(DEFAULT_CENTER);
  const [pendingRequest, setPendingRequest] = useState<Ride | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [todayEarnings, setTodayEarnings] = useState({ count: 0, total: 0 });
  const [otpInput, setOtpInput] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const lastAlertedKey = useRef<string | null>(null);

  // Load captain row (or create)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("captains").select("*").eq("id", user!.id).maybeSingle();
      if (cancelled) return;
      if (!data) {
        const { data: created } = await supabase
          .from("captains")
          .insert({ id: user!.id, vehicle_type: "bike" as VehicleType })
          .select()
          .single();
        setCaptain(created as Captain);
      } else {
        setCaptain(data as Captain);
      }
    }
    load();
  }, [user]);

  const liveChannelRef = useRef<any>(null);
  const lastDbUpdateTime = useRef<number>(0);

  // Subscribe to live broadcast channel when online
  useEffect(() => {
    if (!user || !captain?.is_online) {
      if (liveChannelRef.current) {
        supabase.removeChannel(liveChannelRef.current);
        liveChannelRef.current = null;
      }
      return;
    }
    const channel = supabase.channel(`captain-live-${user.id}`);
    channel.subscribe();
    liveChannelRef.current = channel;
    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [user, captain?.is_online]);

  // Live GPS tracking when online
  useEffect(() => {
    if (!captain?.is_online || !user) return;
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(pt);

        // 1. Broadcast immediately to WebSocket topic
        if (liveChannelRef.current) {
          liveChannelRef.current.send({
            type: "broadcast",
            event: "location",
            payload: { lat: pt.lat, lng: pt.lng }
          });
        }

        // 2. Throttle database updates to once every 5 seconds
        const now = Date.now();
        if (now - lastDbUpdateTime.current >= 5000) {
          lastDbUpdateTime.current = now;
          await supabase
            .from("captains")
            .update({
              current_lat: pt.lat,
              current_lng: pt.lng,
              last_location_at: new Date().toISOString(),
            })
            .eq("id", user.id);
        }
      },
      (err) => {
        if (err.code === err.PERMISSION_DENIED) {
          toast.error("Location permission denied. Please allow GPS access in settings to stay online.");
        } else {
          console.warn("Geolocation watch error:", err.message);
        }
      },
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [captain?.is_online, user]);

  // Watch for ride requests + active ride
  useEffect(() => {
    if (!user || !captain) return;
    let cancelled = false;

    async function loadActive() {
      // Note: 'otp' column is no longer granted to authenticated; we never read it client-side.
      const { data } = await supabase
        .from("rides")
        .select(
          "id, customer_id, captain_id, status, pickup_address, pickup_lat, pickup_lng, drop_address, drop_lat, drop_lng, vehicle_type, ride_type, fare, distance_km, rejected_by, sender_name, receiver_name, item_description"
        )
        .eq("captain_id", user!.id)
        .in("status", ["accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      
      if (!cancelled) {
        let activeRideRow = (data as unknown as Ride) ?? null;
        if (activeRideRow && activeRideRow.ride_type === "parcel") {
          // Securly fetch sender/receiver phone numbers via RPC
          const { data: contacts } = await supabase.rpc("get_ride_parcel_contacts" as any, {
            _ride_id: activeRideRow.id
          });
          if (contacts && contacts.length > 0) {
            activeRideRow = {
              ...activeRideRow,
              sender_phone: contacts[0].sender_phone,
              receiver_phone: contacts[0].receiver_phone,
            };
          }
        }
        setActiveRide(activeRideRow);
      }
    }

    async function loadPending() {
      if (!captain!.is_online || !captain!.current_lat || !captain!.current_lng) {
        setPendingRequest(null);
        return;
      }
      // Use the safe view that excludes OTP, sender_phone, receiver_phone, customer_id
      const { data } = await supabase
        .from("rides_browseable" as any)
        .select("*")
        .eq("vehicle_type", captain!.vehicle_type)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const myPt: Pt = { lat: captain!.current_lat!, lng: captain!.current_lng! };
      const candidates = (data as any[])
        .filter((r) => !(r.rejected_by ?? []).includes(user!.id))
        .map((r) => ({
          ride: r as Ride,
          dist: haversineKm(myPt, { lat: r.pickup_lat, lng: r.pickup_lng }),
        }))
        .sort((a, b) => a.dist - b.dist);
      setPendingRequest(candidates[0]?.ride ?? null);
    }

    async function loadEarnings() {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const { data } = await supabase
        .from("rides")
        .select("fare")
        .eq("captain_id", user!.id)
        .eq("status", "completed")
        .gte("completed_at", startOfDay.toISOString());
      if (cancelled || !data) return;
      const total = data.reduce((s, r: any) => s + Number(r.fare), 0);
      setTodayEarnings({ count: data.length, total });
    }

    async function reloadCaptain() {
      const { data } = await supabase.from("captains").select("*").eq("id", user!.id).maybeSingle();
      if (!cancelled && data) setCaptain(data as Captain);
    }

    loadActive();
    loadPending();
    loadEarnings();

    const channel = supabase
      .channel(`captain-feed-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, () => {
        loadActive();
        loadPending();
        loadEarnings();
      })
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => {
          loadActive();
          loadPending();
          loadEarnings();
        }
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "captains", filter: `id=eq.${user.id}` },
        reloadCaptain
      )
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, captain]);

  // Play alert sound + 60s auto-reject when a new request arrives
  useEffect(() => {
    if (!pendingRequest || activeRide) {
      stopAlertLoop();
      return;
    }
    const currentKey = `${pendingRequest.id}-${pendingRequest.fare}`;
    if (lastAlertedKey.current === currentKey) return;
    lastAlertedKey.current = currentKey;
    startAlertLoop();
    const timeout = window.setTimeout(() => {
      // auto-skip after timeout
      rejectRide(pendingRequest, true);
    }, ALERT_TIMEOUT_SEC * 1000);
    return () => {
      window.clearTimeout(timeout);
      stopAlertLoop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingRequest?.id, pendingRequest?.fare, activeRide?.id]);

  async function toggleOnline(next: boolean) {
    if (!user || !captain) return;
    if (next) {
      // Go online immediately with fallback/last-known location to prevent UI freeze/lag
      const fallbackLat = captain.current_lat ?? DEFAULT_CENTER.lat;
      const fallbackLng = captain.current_lng ?? DEFAULT_CENTER.lng;
      
      const { error } = await supabase
        .from("captains")
        .update({
          is_online: true,
          current_lat: fallbackLat,
          current_lng: fallbackLng,
          last_location_at: new Date().toISOString(),
        })
        .eq("id", user.id);
      
      if (error) {
        toast.error(error.message);
        return;
      }
      
      setCaptain({
        ...captain,
        is_online: true,
        current_lat: fallbackLat,
        current_lng: fallbackLng,
      });
      toast.success("You're online!");
      
      // Asynchronously try to get precise location in the background
      if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            await supabase
              .from("captains")
              .update({
                current_lat: pt.lat,
                current_lng: pt.lng,
                last_location_at: new Date().toISOString(),
              })
              .eq("id", user.id);
            setCaptain((prev) => prev ? {
              ...prev,
              current_lat: pt.lat,
              current_lng: pt.lng,
            } : null);
          },
          () => {} // Silent ignore if background precise location fails
        );
      }
    } else {
      const { error } = await supabase.from("captains").update({ is_online: false }).eq("id", user.id);
      if (error) toast.error(error.message);
      else {
        setCaptain({ ...captain, is_online: false });
        toast.success("You're offline");
      }
    }
  }

  async function acceptRide(r: Ride) {
    stopAlertLoop();
    const { error } = await supabase
      .from("rides")
      .update({ captain_id: user!.id, status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", "requested");
    if (error) toast.error(error.message);
    else {
      toast.success("Ride accepted!");
      setPendingRequest(null);
    }
  }

  async function rejectRide(r: Ride, silent = false) {
    stopAlertLoop();
    const newRejected = [...(r.rejected_by ?? []), user!.id];
    await supabase.from("rides").update({ rejected_by: newRejected }).eq("id", r.id);
    setPendingRequest(null);
    if (!silent) toast("Ride skipped");
  }

  async function verifyOtpAndStart() {
    if (!activeRide) return;
    if (otpInput.length !== 4) {
      toast.error("Enter the 4-digit OTP");
      return;
    }
    const { data, error } = await supabase.rpc("verify_ride_otp" as any, {
      _ride_id: activeRide.id,
      _otp: otpInput,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    if (data === true) {
      toast.success("Ride started!");
      setOtpInput("");
    } else {
      toast.error("Incorrect OTP");
    }
  }

  async function completeRide() {
    if (!activeRide) return;
    const { error } = await supabase
      .from("rides")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", activeRide.id);
    if (error) toast.error(error.message);
    else toast.success(`Ride completed! Collect ₹${activeRide.fare}`);
  }

  async function confirmCancel(reason: string) {
    const ride = activeRide ?? pendingRequest;
    if (!ride || !user) return;
    const { error } = await supabase
      .from("rides")
      .update({ status: "cancelled", cancellation_reason: reason, cancelled_by: user.id })
      .eq("id", ride.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await supabase.from("cancellations").insert({
      ride_id: ride.id,
      cancelled_by: user.id,
      cancelled_by_role: "captain",
      reason,
    });
    setCancelOpen(false);
    setActiveRide(null);
    setPendingRequest(null);
    toast.warning("Ride cancelled. Your rating dropped by 0.2.");
  }

  if (!captain) {
    return <LoadingSpinner message="Loading Dashboard" messageTa="டாஷ்போர்டு ஏற்றப்படுகிறது..." />;
  }

  // Cancellation warning text
  const today = new Date().toISOString().slice(0, 10);
  const todayCancels = captain.daily_cancel_date === today ? captain.daily_cancel_count : 0;
  const cancelWarning =
    todayCancels >= 2
      ? "⚠️ You will be auto-blocked offline if you cancel one more ride today."
      : todayCancels >= 1
      ? `You've already cancelled ${todayCancels} ride(s) today. Frequent cancellations hurt your earnings.`
      : undefined;

  return (
    <div className="flex flex-col h-screen">
      <AppHeader />
      <div className="relative flex-1">
        <MapView
          center={center}
          pickup={activeRide ? { lat: activeRide.pickup_lat, lng: activeRide.pickup_lng } : undefined}
          drop={activeRide ? { lat: activeRide.drop_lat, lng: activeRide.drop_lng } : undefined}
        />

        {/* Top status strip */}
        <div className="absolute top-3 left-3 right-3 z-10">
          <Card className="p-3 shadow-lg flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className="h-3 w-3 rounded-full"
                style={{
                  backgroundColor: captain.is_online ? "hsl(var(--success))" : "hsl(var(--muted-foreground))",
                  animation: captain.is_online ? "pulse 1.5s infinite" : "none",
                }}
              />
              <div>
                <div className="text-sm font-bold">{captain.is_online ? "Online" : "Offline"}</div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Star className="h-3 w-3 fill-current text-yellow-500" />
                  {Number(captain.rating).toFixed(1)} · {captain.completed_rides} rides
                </div>
              </div>
            </div>
            <Switch checked={captain.is_online} onCheckedChange={toggleOnline} />
          </Card>
        </div>

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pointer-events-none">
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border-2 max-h-[80vh] overflow-y-auto">
            {pendingRequest && !activeRide ? (
              <RequestPanel
                ride={pendingRequest}
                myLoc={center}
                onAccept={() => acceptRide(pendingRequest)}
                onReject={() => rejectRide(pendingRequest)}
              />
            ) : activeRide ? (
              <ActiveRidePanel
                ride={activeRide}
                otpInput={otpInput}
                onOtpChange={setOtpInput}
                onVerifyOtp={verifyOtpAndStart}
                onComplete={completeRide}
                onCancelClick={() => setCancelOpen(true)}
              />
            ) : (
              <EarningsPanel
                earnings={todayEarnings}
                captain={captain}
                onUpdate={setCaptain}
                cancelWarning={cancelWarning}
              />
            )}
          </Card>
        </div>

        <CancellationDialog
          open={cancelOpen}
          onOpenChange={setCancelOpen}
          role="captain"
          warning={cancelWarning}
          onConfirm={confirmCancel}
        />
      </div>
    </div>
  );
}

function RequestPanel({
  ride,
  myLoc,
  onAccept,
  onReject,
}: {
  ride: Ride;
  myLoc: Pt;
  onAccept: () => void;
  onReject: () => void;
}) {
  const [secs, setSecs] = useState(ALERT_TIMEOUT_SEC);
  useEffect(() => {
    setSecs(ALERT_TIMEOUT_SEC);
    const i = window.setInterval(() => setSecs((s) => Math.max(0, s - 1)), 1000);
    return () => window.clearInterval(i);
  }, [ride.id]);

  const distToPickup = haversineKm(myLoc, { lat: ride.pickup_lat, lng: ride.pickup_lng });
  const isParcel = ride.ride_type === "parcel";

  return (
    <div className="space-y-3 animate-in fade-in zoom-in-95">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isParcel ? (
            <span className="text-xs font-bold bg-orange-500 text-white px-2 py-1 rounded">📦 PARCEL</span>
          ) : (
            <span className="text-xs font-bold bg-primary text-primary-foreground px-2 py-1 rounded">RIDE</span>
          )}
          <div className="text-sm font-bold">New Request</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold">₹{ride.fare}</div>
          <div className="text-[10px] text-muted-foreground">{ride.distance_km} km · {secs}s</div>
        </div>
      </div>

      {/* Countdown bar */}
      <div className="h-1 bg-muted rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${(secs / ALERT_TIMEOUT_SEC) * 100}%` }}
        />
      </div>

      <div className="bg-muted rounded-lg p-3 space-y-2 text-sm">
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
          <span className="line-clamp-2">{ride.pickup_address}</span>
        </div>
        <div className="flex items-start gap-2">
          <div className="h-2 w-2 rounded-full bg-secondary mt-1.5 shrink-0" />
          <span className="line-clamp-2">{ride.drop_address}</span>
        </div>
      </div>

      {isParcel && ride.item_description && (
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-lg p-2 text-xs">
          <div className="font-semibold flex items-center gap-1">
            <Package className="h-3 w-3" /> Item: {ride.item_description}
          </div>
          <div className="text-muted-foreground mt-1">
            From: {ride.sender_name} · To: {ride.receiver_name}
          </div>
        </div>
      )}

      <div className="text-xs text-muted-foreground text-center">
        ~{distToPickup.toFixed(1)} km away from pickup
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onReject} className="h-12">
          <X className="h-4 w-4 mr-1" /> Skip
        </Button>
        <Button onClick={onAccept} className="h-12 font-bold">
          <CheckCircle2 className="h-4 w-4 mr-1" /> Accept
        </Button>
      </div>
    </div>
  );
}

function ActiveRidePanel({
  ride,
  otpInput,
  onOtpChange,
  onVerifyOtp,
  onComplete,
  onCancelClick,
}: {
  ride: Ride;
  otpInput: string;
  onOtpChange: (v: string) => void;
  onVerifyOtp: () => void;
  onComplete: () => void;
  onCancelClick: () => void;
}) {
  const dest =
    ride.status === "accepted"
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng, label: "Go to pickup" }
      : { lat: ride.drop_lat, lng: ride.drop_lng, label: "Go to drop" };
  const navUrl = `https://www.google.com/maps/dir/?api=1&origin=${center.lat},${center.lng}&destination=${dest.lat},${dest.lng}&travelmode=driving`;
  const isParcel = ride.ride_type === "parcel";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {isParcel ? (
            <span className="text-xs font-bold bg-orange-500 text-white px-2 py-1 rounded">📦 PARCEL</span>
          ) : null}
          <div>
            <div className="text-sm font-bold">
              {ride.status === "accepted" ? "Heading to pickup" : isParcel ? "Delivering parcel" : "Ride in progress"}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold">₹{ride.fare}</div>
          <div className="text-[10px] text-muted-foreground">{ride.distance_km} km</div>
        </div>
      </div>

      {/* Customer / Receiver details */}
      {isParcel ? (
        <div className="bg-orange-50 dark:bg-orange-950/20 rounded-xl p-3 space-y-2 text-sm">
          <div className="font-semibold">📦 {ride.item_description}</div>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-muted-foreground">Sender</div>
              <div className="font-semibold">{ride.sender_name}</div>
              {ride.sender_phone && (
                <a href={`tel:${ride.sender_phone}`} className="text-primary underline">
                  {ride.sender_phone}
                </a>
              )}
            </div>
            <div>
              <div className="text-muted-foreground">Receiver</div>
              <div className="font-semibold">{ride.receiver_name}</div>
              {ride.receiver_phone && (
                <a href={`tel:${ride.receiver_phone}`} className="text-primary underline">
                  {ride.receiver_phone}
                </a>
              )}
            </div>
          </div>
        </div>
      ) : (
        <CustomerCard customerId={ride.customer_id} />
      )}

      <div className="bg-muted rounded-lg p-3 text-sm">
        <div className="font-medium">{dest.label}:</div>
        <div className="line-clamp-2 text-muted-foreground">
          {ride.status === "accepted" ? ride.pickup_address : ride.drop_address}
        </div>
      </div>

      <a href={navUrl} target="_blank" rel="noreferrer">
        <Button variant="outline" className="w-full">
          <Navigation className="h-4 w-4 mr-1" /> Open in maps
        </Button>
      </a>

      {ride.status === "accepted" ? (
        <div className="space-y-2 bg-primary/5 rounded-xl p-3">
          <div className="flex items-center justify-center gap-1 text-xs font-semibold">
            <KeyRound className="h-3 w-3" /> Ask {isParcel ? "sender" : "customer"} for 4-digit OTP
          </div>
          <div className="flex justify-center">
            <OtpInput value={otpInput} onChange={onOtpChange} />
          </div>
          <Button onClick={onVerifyOtp} disabled={otpInput.length !== 4} className="w-full h-11 font-bold">
            Verify OTP & Start
          </Button>
        </div>
      ) : (
        <Button onClick={onComplete} className="w-full h-12 font-bold">
          Complete · Collect ₹{ride.fare}
        </Button>
      )}

      {ride.status === "accepted" && (
        <Button variant="ghost" size="sm" onClick={onCancelClick} className="w-full text-destructive">
          <X className="h-4 w-4 mr-1" /> Cancel ride
        </Button>
      )}
    </div>
  );
}

function EarningsPanel({
  earnings,
  captain,
  onUpdate,
  cancelWarning,
}: {
  earnings: { count: number; total: number };
  captain: Captain;
  onUpdate: (c: Captain) => void;
  cancelWarning?: string;
}) {
  const [showDocs, setShowDocs] = useState(false);
  return (
    <div className="space-y-3">
      <EarningsBreakdown captainId={captain.id} />


      {/* Captain stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="bg-muted rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Rating</div>
          <div className="text-lg font-bold flex items-center justify-center gap-1">
            <Star className="h-3 w-3 fill-current text-yellow-500" />
            {Number(captain.rating).toFixed(1)}
          </div>
        </div>
        <div className="bg-muted rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Total rides</div>
          <div className="text-lg font-bold">{captain.completed_rides}</div>
        </div>
        <div className="bg-muted rounded-lg p-2 text-center">
          <div className="text-[10px] text-muted-foreground">Cancels</div>
          <div className="text-lg font-bold text-destructive">{captain.cancelled_rides}</div>
        </div>
      </div>

      {cancelWarning && (
        <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-2 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>{cancelWarning}</span>
        </div>
      )}

      {captain.warning_level > 0 && (
        <div className="flex items-start gap-2 bg-orange-100 dark:bg-orange-950/30 text-orange-800 dark:text-orange-300 rounded-lg p-2 text-xs">
          <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
          <span>
            You have {captain.warning_level} warning{captain.warning_level > 1 ? "s" : ""} on your account. Repeat
            cancellations may suspend your account.
          </span>
        </div>
      )}

      {!captain.verified && (
        <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 text-center">
          Not verified yet · சரிபார்க்கப்படவில்லை — admin will review your documents
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => setShowDocs((s) => !s)}>
        <Upload className="h-4 w-4 mr-1" /> {showDocs ? "Hide" : "Profile & documents"}
      </Button>

      {showDocs && <DocsForm captain={captain} onUpdate={onUpdate} />}
    </div>
  );
}

function DocsForm({ captain, onUpdate }: { captain: Captain; onUpdate: (c: Captain) => void }) {
  const [fullName, setFullName] = useState(captain.full_name ?? "");
  const [phone, setPhone] = useState(captain.phone ?? "");
  const [upiId, setUpiId] = useState(captain.upi_id ?? "");
  const [vehicleNumber, setVehicleNumber] = useState(captain.vehicle_number ?? "");
  const [licenseNumber, setLicenseNumber] = useState(captain.license_number ?? "");
  const [saving, setSaving] = useState(false);
  const [uploadingField, setUploadingField] = useState<string | null>(null);

  // Client-side image compression
  async function compressImage(file: File): Promise<Blob> {
    return new Promise((resolve) => {
      const img = new Image();
      img.src = URL.createObjectURL(file);
      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }
        const maxDim = 1200;
        let width = img.width;
        let height = img.height;
        if (width > maxDim || height > maxDim) {
          if (width > height) {
            height = (height / width) * maxDim;
            width = maxDim;
          } else {
            width = (width / height) * maxDim;
            height = maxDim;
          }
        }
        canvas.width = width;
        canvas.height = height;
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              resolve(blob);
            } else {
              resolve(file);
            }
          },
          "image/jpeg",
          0.75
        );
      };
      img.onerror = () => resolve(file);
    });
  }

  async function uploadFile(field: "license_url" | "rc_url" | "photo_url", file: File) {
    if (!file.type.startsWith("image/")) {
      toast.error("Only image files are allowed");
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File size must be under 5MB");
      return;
    }

    setUploadingField(field);
    try {
      toast("Compressing image...");
      const compressedBlob = await compressImage(file);
      
      const bucket =
        field === "photo_url"
          ? "profile-images"
          : field === "license_url"
          ? "licenses"
          : "vehicle-documents";

      const ext = file.name.split(".").pop();
      const path = `${captain.id}/${field}-${Date.now()}.${ext}`;

      toast("Uploading secure document...");
      const { error } = await supabase.storage.from(bucket).upload(path, compressedBlob, { upsert: true });
      if (error) {
        toast.error(error.message);
        return;
      }
      const update: any = { [field]: path };
      const { error: upErr } = await supabase.from("captains").update(update).eq("id", captain.id);
      if (upErr) toast.error(upErr.message);
      else {
        toast.success("Document uploaded successfully");
        onUpdate({ ...captain, [field]: path } as Captain);
      }
    } catch (err: any) {
      toast.error(err.message ?? "Upload failed");
    } finally {
      setUploadingField(null);
    }
  }

  async function saveText() {
    setSaving(true);
    const { error } = await supabase
      .from("captains")
      .update({
        full_name: fullName,
        phone,
        upi_id: upiId,
        vehicle_number: vehicleNumber,
        license_number: licenseNumber,
      })
      .eq("id", captain.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      onUpdate({
        ...captain,
        full_name: fullName,
        phone,
        upi_id: upiId,
        vehicle_number: vehicleNumber,
        license_number: licenseNumber,
      });
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="space-y-1">
        <Label className="text-xs">Full name</Label>
        <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label className="text-xs">Phone</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9XXXXXXXXX" />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">UPI ID (for payments)</Label>
          <Input value={upiId} onChange={(e) => setUpiId(e.target.value)} placeholder="name@okicici" />
        </div>
      </div>
      <div className="space-y-1">
        <Label className="text-xs">Vehicle Number</Label>
        <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="TN 25 AB 1234" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">License Number</Label>
        <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
      </div>
      <Button size="sm" onClick={saveText} disabled={saving} className="w-full">
        Save details
      </Button>
      {(["photo_url", "license_url", "rc_url"] as const).map((field) => (
        <div key={field} className="flex items-center gap-2">
          <Label className="text-xs flex-1 capitalize">{field.replace("_url", "").replace("_", " ")}</Label>
          {uploadingField === field ? (
            <span className="text-xs text-muted-foreground animate-pulse">Uploading...</span>
          ) : (
            <input
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files?.[0] && uploadFile(field, e.target.files[0])}
              className="text-xs w-48"
            />
          )}
          {captain[field] && !uploadingField && (
            <CheckCircle2 className="h-4 w-4 shrink-0" style={{ color: "hsl(var(--success))" }} />
          )}
        </div>
      ))}
    </div>
  );
}
