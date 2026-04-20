import { useEffect, useRef, useState } from "react";
import { searchPlaces, GeoPlace } from "@/lib/geocode";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

export function PlaceSearch({
  placeholder,
  value,
  onSelect,
  iconColor,
}: {
  placeholder: string;
  value: string;
  onSelect: (place: GeoPlace) => void;
  iconColor?: string;
}) {
  const [q, setQ] = useState(value);
  const [results, setResults] = useState<GeoPlace[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => setQ(value), [value]);

  useEffect(() => {
    if (!q || q === value) return;
    if (q.length < 3) {
      setResults([]);
      return;
    }
    setLoading(true);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = setTimeout(async () => {
      try {
        const r = await searchPlaces(q, ctrl.signal);
        setResults(r);
        setOpen(true);
      } catch {
        // ignore aborts
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, value]);

  return (
    <div className="relative">
      <div className="relative">
        <MapPin
          className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4"
          style={{ color: iconColor ?? "hsl(var(--muted-foreground))" }}
        />
        <Input
          placeholder={placeholder}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => results.length && setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          className="pl-9 h-12 bg-card"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-64 overflow-auto">
          {results.map((r, i) => (
            <button
              key={i}
              type="button"
              onMouseDown={() => {
                onSelect(r);
                setQ(r.display_name);
                setOpen(false);
              }}
              className="w-full text-left px-3 py-2 hover:bg-accent text-sm border-b last:border-0"
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{r.display_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
