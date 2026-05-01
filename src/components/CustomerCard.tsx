import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Phone, User } from "lucide-react";

type Profile = { id: string; full_name: string; phone: string | null };

export function CustomerCard({ customerId }: { customerId: string }) {
  const [p, setP] = useState<Profile | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, full_name, phone")
        .eq("id", customerId)
        .maybeSingle();
      if (!cancelled) setP(data as Profile);
    })();
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!p) return null;

  return (
    <div className="flex items-center gap-3 bg-secondary/10 rounded-xl p-3">
      <div className="h-12 w-12 rounded-full bg-secondary/20 flex items-center justify-center">
        <User className="h-6 w-6" />
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-bold text-sm truncate">{p.full_name}</div>
        <div className="text-[11px] text-muted-foreground">Customer · வாடிக்கையாளர்</div>
      </div>
      {p.phone && (
        <a href={`tel:${p.phone}`}>
          <Button size="icon" className="h-10 w-10 rounded-full">
            <Phone className="h-4 w-4" />
          </Button>
        </a>
      )}
    </div>
  );
}
