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
} from "lucide-react";
import { toast } from "sonner";

export default function AdminDashboard() {
  const { user, role, loading } = useAuth();
  const [stats, setStats] = useState({ rides: 0, revenue: 0, captains: 0, customers: 0, completionRate: 0 });
  const [captains, setCaptains] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState<Record<string, any>>({});
  const [rides, setRides] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [docCaptain, setDocCaptain] = useState<any | null>(null);
  const [docUrls, setDocUrls] = useState<{ license?: string; rc?: string; photo?: string }>({});

  useEffect(() => {
    if (!user || role !== "admin") return;
    refresh();
    const channel = supabase
      .channel("admin-feed")
      .on("postgres_changes", { event: "*", schema: "public", table: "rides" }, refresh)
      .on("postgres_changes", { event: "*", schema: "public", table: "captains" }, refresh)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, role]);

  async function refresh() {
    const [{ data: rideRows }, { data: capRows }, { data: roleRows }] = await Promise.all([
      supabase.from("rides").select("*").order("created_at", { ascending: false }).limit(100),
      supabase.from("captains").select("*").order("created_at", { ascending: false }),
      supabase.from("user_roles").select("role"),
    ]);
    const allRides = (rideRows as any[]) ?? [];
    const allCaps = (capRows as any[]) ?? [];
    const allRoles = (roleRows as any[]) ?? [];
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
    setRides(allRides);
  }

  async function toggleVerify(captainId: string, verified: boolean) {
    setBusy(true);
    const { error } = await supabase.from("captains").update({ verified }).eq("id", captainId);
    setBusy(false);
    if (error) toast.error(error.message);
    else {
      toast.success(verified ? "Captain verified" : "Verification revoked");
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
      toast.warning("Captain suspended");
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
          <TabsList>
            <TabsTrigger value="captains">Captains ({captains.length})</TabsTrigger>
            <TabsTrigger value="rides">Rides ({rides.length})</TabsTrigger>
          </TabsList>

          <TabsContent value="captains" className="space-y-2 mt-3">
            {captains.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No captains yet</p>
            )}
            {captains.map((c) => (
              <Card key={c.id} className="p-3">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="flex-1 min-w-[200px]">
                    <div className="flex items-center gap-2">
                      <div className="font-bold">{c.full_name ?? "Unnamed"}</div>
                      {c.verified ? (
                        <Badge className="bg-green-600">Verified</Badge>
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
                    <div className="text-xs text-muted-foreground mt-1 grid grid-cols-2 gap-x-3">
                      <span>📱 {c.phone ?? "—"}</span>
                      <span>🚗 {c.vehicle_type} · {c.vehicle_number ?? "—"}</span>
                      <span>⭐ {Number(c.rating).toFixed(1)}</span>
                      <span>✅ {c.completed_rides} · ❌ {c.cancelled_rides}</span>
                      <span>UPI: {c.upi_id ?? "—"}</span>
                      <span>License: {c.license_number ?? "—"}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
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
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>

          <TabsContent value="rides" className="space-y-2 mt-3">
            {rides.length === 0 && (
              <p className="text-sm text-muted-foreground text-center py-6">No rides yet</p>
            )}
            {rides.map((r) => (
              <Card key={r.id} className="p-3 text-sm">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                      <Badge variant="outline">{r.ride_type}</Badge>
                      <Badge variant="outline">{r.vehicle_type}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(r.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-xs">
                      <div className="truncate">📍 {r.pickup_address}</div>
                      <div className="truncate">🏁 {r.drop_address}</div>
                      {r.cancellation_reason && (
                        <div className="text-destructive mt-1">Cancelled: {r.cancellation_reason}</div>
                      )}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-extrabold text-lg">₹{r.fare}</div>
                    <div className="text-xs text-muted-foreground">{r.distance_km} km</div>
                  </div>
                </div>
              </Card>
            ))}
          </TabsContent>
        </Tabs>
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
