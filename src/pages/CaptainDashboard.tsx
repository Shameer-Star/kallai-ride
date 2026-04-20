import { useEffect, useState } from "react";
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
import { Bike, Car, CheckCircle2, IndianRupee, MapPin, Navigation, Upload, X } from "lucide-react";
import { toast } from "sonner";

type Pt = { lat: number; lng: number };
type Captain = {
  id: string;
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
  fare: number;
  distance_km: number;
  rejected_by: string[];
};

const DEFAULT_CENTER: Pt = { lat: 11.7401, lng: 78.9609 };

export default function CaptainDashboard() {
  const { user } = useAuth();
  const [captain, setCaptain] = useState<Captain | null>(null);
  const [center, setCenter] = useState<Pt>(DEFAULT_CENTER);
  const [pendingRequest, setPendingRequest] = useState<Ride | null>(null);
  const [activeRide, setActiveRide] = useState<Ride | null>(null);
  const [todayEarnings, setTodayEarnings] = useState({ count: 0, total: 0 });

  // Load captain row (or create)
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    async function load() {
      const { data } = await supabase.from("captains").select("*").eq("id", user!.id).maybeSingle();
      if (cancelled) return;
      if (!data) {
        // Create default row if missing (safety net)
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

  // Live GPS tracking when online
  useEffect(() => {
    if (!captain?.is_online || !user) return;
    if (!navigator.geolocation) return;
    const watchId = navigator.geolocation.watchPosition(
      async (pos) => {
        const pt = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCenter(pt);
        await supabase
          .from("captains")
          .update({
            current_lat: pt.lat,
            current_lng: pt.lng,
            last_location_at: new Date().toISOString(),
          })
          .eq("id", user.id);
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, [captain?.is_online, user]);

  // Watch for ride requests + active ride
  useEffect(() => {
    if (!user || !captain) return;
    let cancelled = false;

    async function loadActive() {
      const { data } = await supabase
        .from("rides")
        .select("*")
        .eq("captain_id", user!.id)
        .in("status", ["accepted", "started"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!cancelled) setActiveRide((data as Ride) ?? null);
    }

    async function loadPending() {
      if (!captain!.is_online || !captain!.current_lat || !captain!.current_lng) {
        setPendingRequest(null);
        return;
      }
      // Find nearest requested ride matching vehicle, not previously rejected by me
      const { data } = await supabase
        .from("rides")
        .select("*")
        .eq("status", "requested")
        .eq("vehicle_type", captain!.vehicle_type)
        .order("created_at", { ascending: true });
      if (cancelled || !data) return;
      const myPt: Pt = { lat: captain!.current_lat!, lng: captain!.current_lng! };
      const candidate = (data as Ride[]).find(
        (r) =>
          !r.rejected_by.includes(user!.id) &&
          haversineKm(myPt, { lat: r.pickup_lat, lng: r.pickup_lng }) <= MATCH_RADIUS_KM
      );
      setPendingRequest(candidate ?? null);
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
      .subscribe();
    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [user, captain]);

  async function toggleOnline(next: boolean) {
    if (!user || !captain) return;
    if (next && !navigator.geolocation) {
      toast.error("Location not available");
      return;
    }
    if (next) {
      // Capture current location synchronously before going online
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { error } = await supabase
            .from("captains")
            .update({
              is_online: true,
              current_lat: pos.coords.latitude,
              current_lng: pos.coords.longitude,
              last_location_at: new Date().toISOString(),
            })
            .eq("id", user.id);
          if (error) toast.error(error.message);
          else {
            setCaptain({
              ...captain,
              is_online: true,
              current_lat: pos.coords.latitude,
              current_lng: pos.coords.longitude,
            });
            toast.success("You're online!");
          }
        },
        (err) => toast.error("Allow location to go online: " + err.message)
      );
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
    const { error } = await supabase
      .from("rides")
      .update({ captain_id: user!.id, status: "accepted", accepted_at: new Date().toISOString() })
      .eq("id", r.id)
      .eq("status", "requested"); // optimistic — first to accept wins
    if (error) toast.error(error.message);
    else {
      toast.success("Ride accepted!");
      setPendingRequest(null);
    }
  }

  async function rejectRide(r: Ride) {
    const newRejected = [...(r.rejected_by ?? []), user!.id];
    await supabase.from("rides").update({ rejected_by: newRejected }).eq("id", r.id);
    setPendingRequest(null);
  }

  async function startRide() {
    if (!activeRide) return;
    await supabase
      .from("rides")
      .update({ status: "started", started_at: new Date().toISOString() })
      .eq("id", activeRide.id);
  }

  async function completeRide() {
    if (!activeRide) return;
    await supabase
      .from("rides")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("id", activeRide.id);
    toast.success(`Ride completed! +₹${activeRide.fare}`);
  }

  if (!captain) {
    return (
      <div className="flex flex-col h-screen">
        <AppHeader />
        <div className="flex-1 flex items-center justify-center">Loading...</div>
      </div>
    );
  }

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
              <div className={`h-3 w-3 rounded-full ${captain.is_online ? "bg-success animate-pulse" : "bg-muted-foreground"}`}
                style={captain.is_online ? { backgroundColor: "hsl(var(--success))" } : {}} />
              <div>
                <div className="text-sm font-bold">{captain.is_online ? "Online" : "Offline"}</div>
                <div className="text-[10px] text-muted-foreground">
                  {captain.is_online ? "ஆன்லைன்" : "ஆஃப்லைன்"} · {captain.vehicle_type === "bike" ? "🛵 Bike" : "🛺 Auto"}
                </div>
              </div>
            </div>
            <Switch checked={captain.is_online} onCheckedChange={toggleOnline} />
          </Card>
        </div>

        {/* Bottom panel */}
        <div className="absolute bottom-0 left-0 right-0 z-10 p-3 pointer-events-none">
          <Card className="pointer-events-auto p-4 shadow-2xl rounded-2xl border-2">
            {pendingRequest && !activeRide ? (
              <RequestPanel
                ride={pendingRequest}
                myLoc={center}
                onAccept={() => acceptRide(pendingRequest)}
                onReject={() => rejectRide(pendingRequest)}
              />
            ) : activeRide ? (
              <ActiveRidePanel ride={activeRide} onStart={startRide} onComplete={completeRide} />
            ) : (
              <EarningsPanel earnings={todayEarnings} captain={captain} onUpdate={setCaptain} />
            )}
          </Card>
        </div>
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
  const distToPickup = haversineKm(myLoc, { lat: ride.pickup_lat, lng: ride.pickup_lng });
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">New Ride Request</div>
          <div className="text-[10px] text-muted-foreground">புதிய சவாரி கோரிக்கை</div>
        </div>
        <div className="text-right">
          <div className="text-2xl font-extrabold">₹{ride.fare}</div>
          <div className="text-[10px] text-muted-foreground">{ride.distance_km} km trip</div>
        </div>
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
      <div className="text-xs text-muted-foreground text-center">
        ~{distToPickup.toFixed(1)} km away from pickup
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" onClick={onReject} className="h-12">
          <X className="h-4 w-4 mr-1" /> Reject
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
  onStart,
  onComplete,
}: {
  ride: Ride;
  onStart: () => void;
  onComplete: () => void;
}) {
  const dest =
    ride.status === "accepted"
      ? { lat: ride.pickup_lat, lng: ride.pickup_lng, label: "Go to pickup" }
      : { lat: ride.drop_lat, lng: ride.drop_lng, label: "Go to drop" };
  const navUrl = `https://www.openstreetmap.org/directions?from=&to=${dest.lat},${dest.lng}`;
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-bold">
            {ride.status === "accepted" ? "Heading to pickup" : "Ride in progress"}
          </div>
          <div className="text-[10px] text-muted-foreground">
            {ride.status === "accepted" ? "ஏறும் இடம் நோக்கி" : "சவாரி நடக்கிறது"}
          </div>
        </div>
        <div className="text-right">
          <div className="text-xl font-extrabold">₹{ride.fare}</div>
          <div className="text-[10px] text-muted-foreground">{ride.distance_km} km</div>
        </div>
      </div>
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
        <Button onClick={onStart} className="w-full h-12 font-bold">Start Ride · சவாரி தொடங்கு</Button>
      ) : (
        <Button onClick={onComplete} className="w-full h-12 font-bold">Complete Ride · சவாரி முடி</Button>
      )}
    </div>
  );
}

function EarningsPanel({
  earnings,
  captain,
  onUpdate,
}: {
  earnings: { count: number; total: number };
  captain: Captain;
  onUpdate: (c: Captain) => void;
}) {
  const [showDocs, setShowDocs] = useState(false);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-primary/10 rounded-xl p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <IndianRupee className="h-3 w-3" /> Today's Earnings
          </div>
          <div className="text-2xl font-extrabold">₹{earnings.total}</div>
          <div className="text-[10px] text-muted-foreground">இன்றைய வருமானம்</div>
        </div>
        <div className="bg-secondary/10 rounded-xl p-3">
          <div className="flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCircle2 className="h-3 w-3" /> Total Rides
          </div>
          <div className="text-2xl font-extrabold">{earnings.count}</div>
          <div className="text-[10px] text-muted-foreground">மொத்த சவாரிகள்</div>
        </div>
      </div>

      {!captain.verified && (
        <div className="text-xs bg-destructive/10 text-destructive rounded-lg p-2 text-center">
          Not verified yet · சரிபார்க்கப்படவில்லை — admin will review your documents
        </div>
      )}

      <Button variant="outline" className="w-full" onClick={() => setShowDocs((s) => !s)}>
        <Upload className="h-4 w-4 mr-1" /> {showDocs ? "Hide" : "Manage"} documents
      </Button>

      {showDocs && <DocsForm captain={captain} onUpdate={onUpdate} />}
    </div>
  );
}

function DocsForm({ captain, onUpdate }: { captain: Captain; onUpdate: (c: Captain) => void }) {
  const [vehicleNumber, setVehicleNumber] = useState(captain.vehicle_number ?? "");
  const [licenseNumber, setLicenseNumber] = useState(captain.license_number ?? "");
  const [saving, setSaving] = useState(false);

  async function uploadFile(field: "license_url" | "rc_url" | "photo_url", file: File) {
    const ext = file.name.split(".").pop();
    const path = `${captain.id}/${field}-${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("captain-docs").upload(path, file, { upsert: true });
    if (error) {
      toast.error(error.message);
      return;
    }
    const update: Partial<Captain> = { [field]: path } as Partial<Captain>;
    const { error: upErr } = await supabase.from("captains").update(update).eq("id", captain.id);
    if (upErr) toast.error(upErr.message);
    else {
      toast.success("Uploaded");
      onUpdate({ ...captain, [field]: path } as Captain);
    }
  }

  async function saveText() {
    setSaving(true);
    const { error } = await supabase
      .from("captains")
      .update({ vehicle_number: vehicleNumber, license_number: licenseNumber })
      .eq("id", captain.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Saved");
      onUpdate({ ...captain, vehicle_number: vehicleNumber, license_number: licenseNumber });
    }
  }

  return (
    <div className="space-y-2 border-t pt-3">
      <div className="space-y-1">
        <Label className="text-xs">Vehicle Number</Label>
        <Input value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="TN 25 AB 1234" />
      </div>
      <div className="space-y-1">
        <Label className="text-xs">License Number</Label>
        <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} />
      </div>
      <Button size="sm" onClick={saveText} disabled={saving} className="w-full">Save details</Button>
      {(["license_url", "rc_url", "photo_url"] as const).map((field) => (
        <div key={field} className="flex items-center gap-2">
          <Label className="text-xs flex-1 capitalize">{field.replace("_url", "").replace("_", " ")}</Label>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => e.target.files?.[0] && uploadFile(field, e.target.files[0])}
            className="text-xs"
          />
          {captain[field] && <CheckCircle2 className="h-4 w-4 text-success" style={{ color: "hsl(var(--success))" }} />}
        </div>
      ))}
    </div>
  );
}
