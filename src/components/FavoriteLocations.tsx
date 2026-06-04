import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Heart, Home, Briefcase, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export type FavoriteLocation = {
  id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
};

export function FavoriteLocations({
  currentPickup,
  onSelect,
}: {
  currentPickup?: { pt: { lat: number; lng: number }; address: string } | null;
  onSelect: (f: FavoriteLocation) => void;
}) {
  const { user } = useAuth();
  const [favs, setFavs] = useState<FavoriteLocation[]>([]);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  useEffect(() => {
    if (!user) return;
    supabase
      .from("favorite_locations")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .then(({ data }) => setFavs((data as FavoriteLocation[]) ?? []));
  }, [user]);

  async function saveCurrent() {
    if (!user || !currentPickup || !label.trim()) {
      toast.error("Pickup + label required");
      return;
    }
    const { data, error } = await supabase
      .from("favorite_locations")
      .insert({
        user_id: user.id,
        label: label.trim().slice(0, 30),
        address: currentPickup.address,
        lat: currentPickup.pt.lat,
        lng: currentPickup.pt.lng,
      })
      .select()
      .single();
    if (error) {
      toast.error(error.message);
      return;
    }
    setFavs([...favs, data as FavoriteLocation]);
    setLabel("");
    setAdding(false);
    toast.success("Saved!");
  }

  async function remove(id: string) {
    await supabase.from("favorite_locations").delete().eq("id", id);
    setFavs(favs.filter((f) => f.id !== id));
  }

  function iconFor(label: string) {
    const l = label.toLowerCase();
    if (l.includes("home") || l.includes("வீடு")) return Home;
    if (l.includes("work") || l.includes("office")) return Briefcase;
    return Heart;
  }

  return (
    <div className="space-y-2">
      {favs.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1">
          {favs.map((f) => {
            const Icon = iconFor(f.label);
            return (
              <button
                key={f.id}
                onClick={() => onSelect(f)}
                className="group relative shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted hover:bg-primary/10 border text-xs font-semibold"
              >
                <Icon className="h-3 w-3" />
                {f.label}
                <Trash2
                  className="h-3 w-3 opacity-0 group-hover:opacity-60 hover:!opacity-100 ml-1"
                  onClick={(e) => {
                    e.stopPropagation();
                    remove(f.id);
                  }}
                />
              </button>
            );
          })}
        </div>
      )}
      {adding ? (
        <div className="flex gap-1">
          <Input
            placeholder="Label (Home, Work...)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="h-8 text-xs"
            autoFocus
          />
          <Button size="sm" onClick={saveCurrent} className="h-8">
            Save
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setAdding(false)} className="h-8">
            ×
          </Button>
        </div>
      ) : (
        currentPickup && (
          <button
            onClick={() => setAdding(true)}
            className="text-[11px] text-muted-foreground hover:text-primary flex items-center gap-1"
          >
            <Plus className="h-3 w-3" /> Save current pickup as favorite
          </button>
        )
      )}
    </div>
  );
}
