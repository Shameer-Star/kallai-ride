import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AppHeader } from "@/components/AppHeader";
import { Card } from "@/components/ui/card";
import { Bike, Car, Clock, MapPin } from "lucide-react";

type RideRow = {
  id: string;
  pickup_address: string;
  drop_address: string;
  distance_km: number;
  fare: number;
  vehicle_type: "bike" | "auto";
  status: string;
  created_at: string;
};

export default function History() {
  const { user, role } = useAuth();
  const [rides, setRides] = useState<RideRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const col = role === "captain" ? "captain_id" : "customer_id";
    supabase
      .from("rides")
      .select("id, pickup_address, drop_address, distance_km, fare, vehicle_type, status, created_at")
      .eq(col, user.id)
      .order("created_at", { ascending: false })
      .limit(50)
      .then(({ data }) => {
        setRides((data as RideRow[]) ?? []);
        setLoading(false);
      });
  }, [user, role]);

  return (
    <div className="flex flex-col min-h-screen">
      <AppHeader />
      <main className="flex-1 p-4 max-w-2xl w-full mx-auto">
        <h1 className="text-2xl font-extrabold mb-1">Ride History</h1>
        <p className="text-sm text-muted-foreground mb-4">சவாரி வரலாறு</p>

        {loading ? (
          <p className="text-sm text-muted-foreground">Loading...</p>
        ) : rides.length === 0 ? (
          <Card className="p-8 text-center text-muted-foreground">
            <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No rides yet</p>
          </Card>
        ) : (
          <div className="space-y-3">
            {rides.map((r) => {
              const Icon = r.vehicle_type === "bike" ? Bike : Car;
              const date = new Date(r.created_at);
              return (
                <Card key={r.id} className="p-4">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Icon className="h-4 w-4" />
                      <span className="text-xs font-bold uppercase">{r.vehicle_type}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    <div className="text-right">
                      <div className="font-bold">₹{r.fare}</div>
                      <div className="text-[10px] text-muted-foreground">{r.distance_km} km</div>
                    </div>
                  </div>
                  <div className="space-y-1 text-sm">
                    <div className="flex items-start gap-2">
                      <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />
                      <span className="line-clamp-1 text-muted-foreground">{r.pickup_address}</span>
                    </div>
                    <div className="flex items-start gap-2">
                      <div className="h-2 w-2 rounded-full bg-secondary mt-1.5 shrink-0" />
                      <span className="line-clamp-1 text-muted-foreground">{r.drop_address}</span>
                    </div>
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-2">
                    {date.toLocaleDateString()} · {date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    completed: "bg-success/15 text-foreground",
    cancelled: "bg-destructive/15 text-destructive",
    requested: "bg-primary/15",
    accepted: "bg-primary/15",
    started: "bg-primary/15",
  };
  return (
    <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded ${colors[status] ?? "bg-muted"}`}>
      {status}
    </span>
  );
}
