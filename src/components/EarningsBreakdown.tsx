import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { IndianRupee, TrendingUp, Calendar } from "lucide-react";

export function EarningsBreakdown({ captainId }: { captainId: string }) {
  const [stats, setStats] = useState({
    today: { rides: 0, total: 0 },
    week: { rides: 0, total: 0 },
    month: { rides: 0, total: 0 },
  });

  useEffect(() => {
    if (!captainId) return;
    async function load() {
      const now = new Date();
      const today = new Date(now);
      today.setHours(0, 0, 0, 0);
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() - 7);
      const monthStart = new Date(now);
      monthStart.setDate(now.getDate() - 30);

      const { data } = await supabase
        .from("rides")
        .select("fare, completed_at")
        .eq("captain_id", captainId)
        .eq("status", "completed")
        .gte("completed_at", monthStart.toISOString());

      if (!data) return;
      const agg = { today: { rides: 0, total: 0 }, week: { rides: 0, total: 0 }, month: { rides: 0, total: 0 } };
      for (const r of data as any[]) {
        const t = new Date(r.completed_at);
        const fare = Number(r.fare);
        agg.month.rides++;
        agg.month.total += fare;
        if (t >= weekStart) {
          agg.week.rides++;
          agg.week.total += fare;
        }
        if (t >= today) {
          agg.today.rides++;
          agg.today.total += fare;
        }
      }
      setStats(agg);
    }
    load();
  }, [captainId]);

  const cards = [
    { label: "Today · இன்று", icon: IndianRupee, data: stats.today, color: "bg-primary/10" },
    { label: "7 Days · வாரம்", icon: TrendingUp, data: stats.week, color: "bg-secondary/10" },
    { label: "30 Days · மாதம்", icon: Calendar, data: stats.month, color: "bg-accent/30" },
  ];

  return (
    <div className="grid grid-cols-3 gap-2">
      {cards.map((c) => (
        <div key={c.label} className={`${c.color} rounded-xl p-2.5`}>
          <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
            <c.icon className="h-3 w-3" /> {c.label}
          </div>
          <div className="text-lg font-extrabold">₹{c.data.total}</div>
          <div className="text-[10px] text-muted-foreground">{c.data.rides} ride{c.data.rides === 1 ? "" : "s"}</div>
        </div>
      ))}
    </div>
  );
}
