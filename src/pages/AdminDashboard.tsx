import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  IndianRupee,
  Users,
  Bike,
  CheckCircle2,
  XCircle,
  Loader2,
  Star,
  AlertTriangle,
  FileText,
  ShieldAlert,
  MessageSquare,
  Clock,
  Trash2,
  Search,
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState({ rides: 0, revenue: 0, captains: 0, customers: 0, completionRate: 0 });
  const [captains, setCaptains] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({});
  const [rides, setRides] = useState<any[]>([]);
  const [sosAlerts, setSosAlerts] = useState<any[]>([]);
  const [supportTickets, setSupportTickets] = useState<any[]>([]);
  const [cancellations, setCancellations] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [docCaptain, setDocCaptain] = useState<any | null>(null);
  const [docUrls, setDocUrls] = useState<{ license?: string; rc?: string; photo?: string }>({});
  const [loadingDocs, setLoadingDocs] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [captainSearch, setCaptainSearch] = useState("");
  const [rideSearch, setRideSearch] = useState("");

  useEffect(() => {
    if (!user || role !== "admin") return;
    refresh();
    const channel = supabase
      .channel("admin-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "emergency_alerts" as any }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets" as any }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "cancellations" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  async function refresh() {
    const [
      { data: rideRows },
      { data: capRows },
      { data: roleRows },
      { data: profRows },
      { data: sosRows },
      { data: ticketRows },
      { data: cancelRows }
    ] = await Promise.all([
      supabase.from("rides").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("captains").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("role"),
      supabase.from("profiles").select("id, full_name, phone"),
      supabase.from("emergency_alerts" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("support_tickets" as any).select("*").order("created_at", { ascending: false }),
      supabase.from("cancellations").select("*").order("created_at", { ascending: false }),
    ]);
    const allRides = (rideRows as any[]) ?? [];
    const allCaps = (capRows as any[]) ?? [];
    const allRoles = (roleRows as any[]) ?? [];
    const profMap: Record<string, any> = {};
    ((profRows as any[]) ?? []).forEach((p) => (profMap[p.id] = p));
    const completed = allRides.filter((r) => r.status === "completed");
    const revenue = completed.reduce((s, r) => s + Number(r.fare ?? 0), 0);
    const customers = allRoles.filter((r) => r.role === "customer").length;
    const completionRate = allRides.length
      ? Math.round((completed.length / allRides.length) * 100)
      : 0;
    setStats({
      rides: allRides.length,
      revenue,
      captains: allCaps.length,
      customers,
      completionRate,
    });
    setCaptains(allCaps);
    setProfilesMap(profMap);
    setRides(allRides);
    setSosAlerts(sosRows ?? []);
    setSupportTickets(ticketRows ?? []);
    setCancellations(cancelRows ?? []);
  }

  async function openDocs(c: any) {
    setDocCaptain(c);
    setDocUrls({});
    setLoadingDocs(true);
    const docFields = {
      license: { path: c.license_url, privateBucket: "licenses" },
      rc: { path: c.rc_url, privateBucket: "vehicle-documents" },
      photo: { path: c.photo_url, privateBucket: "profile-images" },
    };
    const urls: any = {};
    for (const k of Object.keys(docFields)) {
      const { path, privateBucket } = docFields[k as keyof typeof docFields];
      if (!path) {
        urls[k] = null;
        continue;
      }
      // 1. Try public 'captain-docs' bucket first (public: true, no auth needed)
      const { data: pubData } = supabase.storage.from("captain-docs").getPublicUrl(path);
      if (pubData?.publicUrl) {
        // Verify the URL actually resolves (HEAD request)
        try {
          const res = await fetch(pubData.publicUrl, { method: "HEAD" });
          if (res.ok) {
            urls[k] = pubData.publicUrl;
            continue;
          }
        } catch { /* fallthrough to signed URL */ }
      }
      // 2. Fallback: try the private bucket with signed URL
      const { data: signedData } = await supabase.storage.from(privateBucket).createSignedUrl(path, 3600);
      if (signedData?.signedUrl) {
        urls[k] = signedData.signedUrl;
      } else {
        // 3. Last resort: try captain-docs with signed URL
        const { data: signedLegacy } = await supabase.storage.from("captain-docs").createSignedUrl(path, 3600);
        urls[k] = signedLegacy?.signedUrl ?? null;
      }
    }
    setDocUrls(urls);
    setLoadingDocs(false);
    const failedDocs = Object.keys(docFields).filter(k => docFields[k as keyof typeof docFields].path && !urls[k]);
    if (failedDocs.length > 0) {
      toast.error(`Could not load: ${failedDocs.join(", ")}. Captain may need to re-upload.`);
    }
  }

  async function toggleVerify(captainId: string, verified: boolean) {
    setBusy(true);
    const { error } = await supabase.from("captains").update({ verified }).eq("id", captainId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(verified ? "Captain approved" : "Captain unapproved");
      refresh();
    }
  }

  async function suspendCaptain(captainId: string) {
    setBusy(true);
    const { error } = await supabase
      .from("captains")
      .update({ is_online: false, warning_level: 99 })
      .eq("id", captainId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.warning("Captain blocked");
      refresh();
    }
  }

  async function deleteCaptain(captainId: string) {
    if (!confirm("Are you sure you want to delete this captain record?")) return;
    setBusy(true);
    const { error } = await supabase.from("captains").delete().eq("id", captainId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Captain deleted");
      refresh();
    }
  }

  async function deleteRide(rideId: string) {
    if (!confirm("Are you sure you want to delete this ride?")) return;
    setBusy(true);
    const { error } = await supabase.from("rides").delete().eq("id", rideId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Ride deleted");
      refresh();
    }
  }

  async function deleteCancellation(cancelId: string) {
    if (!confirm("Delete this cancellation record?")) return;
    setBusy(true);
    const { error } = await supabase.from("cancellations").delete().eq("id", cancelId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success("Cancellation log deleted");
      refresh();
    }
  }

  async function changeWarningLevel(captainId: string, currentLevel: number, delta: number) {
    setBusy(true);
    const nextLevel = Math.max(0, currentLevel + delta);
    const { error } = await supabase
      .from("captains")
      .update({ warning_level: nextLevel })
      .eq("id", captainId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Warning level set to ${nextLevel}`);
      refresh();
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (role !== "admin") return <Navigate to="/" replace />;

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="flex-1 p-4 max-w-6xl mx-auto w-full space-y-4">
        <div>
          <h1 className="text-2xl font-extrabold">Admin Dashboard</h1>
          <p className="text-xs text-muted-foreground">நிர்வாக கட்டுப்பாட்டகம்</p>
        </div>

        {/* KPI cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard icon={IndianRupee} label="Revenue" value={`₹${stats.revenue}`} color="bg-primary/10" />
          <KpiCard icon={Bike} label="Total Rides" value={stats.rides} color="bg-secondary/10" />
          <KpiCard icon={Users} label="Customers" value={stats.customers} color="bg-accent/30" />
          <KpiCard icon={CheckCircle2} label="Captains" value={stats.captains} color="bg-muted" />
          <KpiCard icon={Star} label="Completion %" value={`${stats.completionRate}%`} color="bg-yellow-100 dark:bg-yellow-950/30" />
        </div>

        <Tabs defaultValue="captains" className="w-full">
          <TabsList className="grid grid-cols-3 w-full h-11">
            <TabsTrigger value="captains">Captains ({captains.length})</TabsTrigger>
            <TabsTrigger value="rides">Rides ({rides.length})</TabsTrigger>
            <TabsTrigger value="cancellations" className="flex items-center gap-1">
              <Clock className="h-3.5 w-3.5 shrink-0" /> Cancels ({cancellations.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="captains" className="space-y-2 mt-3 animate-in fade-in">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search captains by name, phone, vehicle..."
                value={captainSearch}
                onChange={(e) => setCaptainSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background"
              />
            </div>
            {captains.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No captains yet</p>
            )}
            {captains
              .filter((c) => {
                if (!captainSearch) return true;
                const q = captainSearch.toLowerCase();
                const name = (profilesMap[c.id]?.full_name ?? c.full_name ?? "").toLowerCase();
                const phone = (profilesMap[c.id]?.phone ?? c.phone ?? "").toLowerCase();
                const vehicle = (c.vehicle_number ?? "").toLowerCase();
                return name.includes(q) || phone.includes(q) || vehicle.includes(q);
              })
              .map((c) => (
                <Card key={c.id} className="p-3">
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex-1 min-w-[200px]">
                      <div className="flex items-center gap-2 flex-wrap">
                        <div className="font-bold">{profilesMap[c.id]?.full_name ?? c.full_name ?? "Unnamed"}</div>
                        {c.verified ? (
                          <Badge className="bg-green-600">Approved</Badge>
                        ) : (
                          <Badge variant="outline">Pending</Badge>
                        )}
                        {c.is_online && <Badge className="bg-primary">Online</Badge>}
                        {c.warning_level > 0 && (
                          <Badge variant="destructive" className="flex items-center gap-1">
                            <AlertTriangle className="h-3 w-3" /> {c.warning_level}
                          </Badge>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1">
                        <span>📱 {profilesMap[c.id]?.phone ?? c.phone ?? "—"}</span>
                        <span>🚗 {c.vehicle_type === "bike" ? "🏍️ Bike" : "🛺 Auto"} · {c.vehicle_number ?? "—"}</span>
                        <span>⭐ {Number(c.rating).toFixed(1)}</span>
                        <span>✅ {c.completed_rides} · ❌ {c.cancelled_rides}</span>
                        <span className="col-span-2">UPI: {c.upi_id ?? "—"}</span>
                        <span className="col-span-2">License: {c.license_number ?? "—"}</span>
                      </div>
                      <div className="flex items-center gap-1.5 mt-2.5">
                        <span className="text-[11px] font-semibold text-muted-foreground mr-1">Warning Level:</span>
                        <Button
                          size="icon"
                          className="h-6 w-6 rounded-full"
                          variant="outline"
                          onClick={() => changeWarningLevel(c.id, c.warning_level, -1)}
                          disabled={c.warning_level === 0 || busy}
                        >
                          -
                        </Button>
                        <span className="text-xs font-bold w-4 text-center">{c.warning_level}</span>
                        <Button
                          size="icon"
                          className="h-6 w-6 rounded-full"
                          variant="outline"
                          onClick={() => changeWarningLevel(c.id, c.warning_level, 1)}
                          disabled={busy}
                        >
                          +
                        </Button>
                      </div>
                    </div>
                    <div className="flex gap-2 flex-wrap items-center">
                      <Button size="sm" variant="secondary" onClick={() => openDocs(c)}>
                        <FileText className="h-4 w-4 mr-1" /> Docs
                      </Button>
                      {c.verified ? (
                        <Button size="sm" variant="outline" onClick={() => toggleVerify(c.id, false)} disabled={busy}>
                          <XCircle className="h-4 w-4 mr-1" /> Revoke
                        </Button>
                      ) : (
                        <Button size="sm" onClick={() => toggleVerify(c.id, true)} disabled={busy}>
                          <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                        </Button>
                      )}
                      <Button size="sm" variant="destructive" onClick={() => suspendCaptain(c.id)} disabled={busy}>
                        Suspend
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => deleteCaptain(c.id)} disabled={busy}>
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
          </TabsContent>

          <TabsContent value="rides" className="space-y-2 mt-3 animate-in fade-in">
            <div className="relative mb-2">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search rides by pickup, drop, status..."
                value={rideSearch}
                onChange={(e) => setRideSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-2 text-sm border rounded-lg bg-background"
              />
            </div>
            {rides.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No rides yet</p>
            )}
            {rides
              .filter((r) => {
                if (!rideSearch) return true;
                const q = rideSearch.toLowerCase();
                return (r.pickup_address ?? "").toLowerCase().includes(q) || (r.drop_address ?? "").toLowerCase().includes(q) || (r.status ?? "").toLowerCase().includes(q);
              })
              .map((r) => (
                <Card key={r.id} className="p-3 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                        <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                        <Badge variant="outline" className="capitalize">{r.ride_type}</Badge>
                        <Badge variant="outline">{r.vehicle_type === "bike" ? "🏍️ Bike" : "🛺 Auto"}</Badge>
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="text-xs space-y-0.5">
                        <div className="truncate">📍 {r.pickup_address}</div>
                        <div className="truncate">🏁 {r.drop_address}</div>
                        {r.cancellation_reason && (
                          <div className="text-destructive mt-1 font-medium">Reason: {r.cancellation_reason}</div>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0 flex flex-col items-end gap-1">
                      <div className="font-extrabold text-lg">₹{r.fare}</div>
                      <div className="text-xs text-muted-foreground">{r.distance_km} km</div>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive" onClick={() => deleteRide(r.id)} disabled={busy}>
                        <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
          </TabsContent>

          <TabsContent value="cancellations" className="space-y-2 mt-3 animate-in fade-in">
            {cancellations.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No cancellations log</p>
            )}
            {cancellations.map((c) => (
              <Card key={c.id} className="p-4 text-sm flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <Badge variant="outline" className="capitalize bg-muted">
                      Cancelled by: {c.cancelled_by_role}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {new Date(c.created_at).toLocaleString()}
                    </span>
                  </div>
                  <div className="space-y-1 mt-1">
                    <div className="flex items-center justify-between">
                      <div>
                        <span className="font-semibold text-muted-foreground">Reason:</span> "{c.reason}"
                      </div>
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-destructive shrink-0" onClick={() => deleteCancellation(c.id)} disabled={busy}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      Ride ID: {c.ride_id} · User: {profilesMap[c.cancelled_by]?.full_name ?? "User"}
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>

        <Dialog open={!!docCaptain} onOpenChange={(o) => !o && setDocCaptain(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                Documents · {profilesMap[docCaptain?.id]?.full_name ?? docCaptain?.full_name ?? "Captain"}
              </DialogTitle>
            </DialogHeader>
            {docCaptain && (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-muted-foreground">Phone:</span> {profilesMap[docCaptain.id]?.phone ?? "—"}</div>
                  <div><span className="text-muted-foreground">Vehicle:</span> {docCaptain.vehicle_type} {docCaptain.vehicle_number ?? ""}</div>
                  <div><span className="text-muted-foreground">License #:</span> {docCaptain.license_number ?? "—"}</div>
                  <div><span className="text-muted-foreground">UPI:</span> {docCaptain.upi_id ?? "—"}</div>
                </div>
                {(["photo", "license", "rc"] as const).map((k) => (
                  <div key={k}>
                    <div className="font-semibold capitalize mb-1">{k}</div>
                    {loadingDocs ? (
                      <div className="flex items-center gap-2 text-muted-foreground text-xs">
                        <Loader2 className="h-4 w-4 animate-spin" /> Loading...
                      </div>
                    ) : docUrls[k] ? (
                      <div onClick={() => setSelectedImage(docUrls[k]!)} className="cursor-pointer inline-block">
                        <img src={docUrls[k]} alt={k} className="max-h-64 rounded border hover:opacity-80 transition-opacity" />
                      </div>
                    ) : (
                      <div className="text-muted-foreground text-xs">
                        {docCaptain[k === "photo" ? "photo_url" : k === "license" ? "license_url" : "rc_url"]
                          ? "⚠️ Uploaded but could not load — check storage policies"
                          : "Not uploaded"}
                      </div>
                    )}
                  </div>
                ))}
                <div className="flex gap-2 pt-2 border-t">
                  {docCaptain.verified ? (
                    <Button variant="outline" onClick={() => { toggleVerify(docCaptain.id, false); setDocCaptain(null); }}>
                      <XCircle className="h-4 w-4 mr-1" /> Revoke Verification
                    </Button>
                  ) : (
                    <Button onClick={() => { toggleVerify(docCaptain.id, true); setDocCaptain(null); }}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Approve Captain
                    </Button>
                  )}
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={!!selectedImage} onOpenChange={(open) => !open && setSelectedImage(null)}>
          <DialogContent className="max-w-4xl w-fit p-1 bg-transparent border-none shadow-none flex justify-center">
            {selectedImage && (
              <img src={selectedImage} alt="Document preview" className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg" />
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: any; color: string }) {
  return (
    <Card className={`${color} p-3 border-2`}>
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-2xl font-extrabold mt-1">{value}</div>
    </Card>
  );
}

function statusVariant(s: string): any {
  if (s === "completed") return "default";
  if (s === "cancelled") return "destructive";
  return "secondary";
}
