import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Phone, Star } from "lucide-react";

type Captain = {
  id: string;
  full_name: string | null;
  vehicle_number: string | null;
  vehicle_type: string;
  rating: number;
  total_rides: number;
  photo_url: string | null;
  phone: string | null;
};

export function DriverCard({ captainId }: { captainId: string }) {
  const [c, setC] = useState<Captain | null>(null);
  const [photoSigned, setPhotoSigned] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("captains")
        .select("id, full_name, vehicle_number, vehicle_type, rating, total_rides, photo_url, phone")
        .eq("id", captainId)
        .maybeSingle();
      if (cancelled) return;
      setC(data as Captain);
      if (data?.photo_url) {
        const { data: signed } = await supabase.storage
          .from("captain-docs")
          .createSignedUrl(data.photo_url, 600);
        if (!cancelled) setPhotoSigned(signed?.signedUrl ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [captainId]);

  if (!c) return null;

  const initials = (c.full_name ?? "C").slice(0, 2).toUpperCase();

  return (
    <div className="flex items-center gap-3 bg-primary/5 rounded-xl p-3">
      <Avatar className="h-14 w-14 border-2 border-primary">
        {photoSigned && <AvatarImage src={photoSigned} alt={c.full_name ?? "Captain"} />}
        <AvatarFallback>{initials}</AvatarFallback>
      </Avatar>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{c.full_name ?? "Captain"}</div>
        <div className="text-[11px] text-muted-foreground truncate">
          {c.vehicle_type === "bike" ? "🛵" : "🛺"} {c.vehicle_number ?? "—"}
        </div>
        <div className="flex items-center gap-1 text-xs">
          <Star className="h-3 w-3 fill-current text-yellow-500" />
          <span className="font-semibold">{Number(c.rating).toFixed(1)}</span>
          <span className="text-muted-foreground">· {c.total_rides} rides</span>
        </div>
      </div>
      {c.phone && (
        <a href={`tel:${c.phone}`}>
          <Button size="icon" className="h-11 w-11 rounded-full">
            <Phone className="h-5 w-5" />
          </Button>
        </a>
      )}
    </div>
  );
}
