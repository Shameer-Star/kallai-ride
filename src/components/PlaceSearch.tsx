import { useEffect, useRef, useState, useMemo } from "react";
import { searchPlaces, searchLocalPlaces, GeoPlace } from "@/lib/geocode";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin, X } from "lucide-react";

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
  const [searchDone, setSearchDone] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => setQ(value), [value]);

  // Instant local matches (no debounce, no network)
  const instantLocal = useMemo(() => {
    if (!q || q === value || q.length < 2) return [];
    return searchLocalPlaces(q);
  }, [q, value]);

  // Show instant local results immediately
  useEffect(() => {
    if (instantLocal.length > 0 && q !== value) {
      setResults(instantLocal);
      setOpen(true);
    }
  }, [instantLocal, q, value]);

  // Debounced network search
  useEffect(() => {
    if (!q || q === value) {
      setSearchDone(false);
      return;
    }
    if (q.length < 3) {
      // For very short queries, only show local results
      setResults(instantLocal);
      setSearchDone(true);
      return;
    }
    setLoading(true);
    setSearchDone(false);
    abortRef.current?.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    const id = setTimeout(async () => {
      try {
        const r = await searchPlaces(q, ctrl.signal);
        setResults(r);
        setOpen(true);
        setSearchDone(true);
      } catch {
        // ignore aborts
      } finally {
        setLoading(false);
      }
    }, 250); // Reduced from 400ms to 250ms
    return () => {
      clearTimeout(id);
      ctrl.abort();
    };
  }, [q, value, instantLocal]);

  function clearInput() {
    setQ("");
    setResults([]);
    setOpen(false);
    setSearchDone(false);
  }

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
          onBlur={() => setTimeout(() => setOpen(false), 300)} // Increased from 150ms to 300ms for mobile
          className="pl-9 pr-9 h-12 bg-card"
        />
        {/* Clear button */}
        {q && (
          <button
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              clearInput();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 h-5 w-5 rounded-full bg-muted hover:bg-muted-foreground/20 flex items-center justify-center transition-colors"
          >
            <X className="h-3 w-3 text-muted-foreground" />
          </button>
        )}
        {loading && (
          <Loader2 className="absolute right-9 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
        )}
      </div>
      {open && results.length > 0 && (
        <div
          ref={dropdownRef}
          className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg max-h-64 overflow-auto"
          onMouseDown={(e) => e.preventDefault()} // Prevent blur when scrolling
          onTouchStart={(e) => e.stopPropagation()} // Prevent blur on mobile touch
        >
          {results.map((r, i) => (
            <button
              key={`${r.lat}-${r.lng}-${i}`}
              type="button"
              onMouseDown={() => {
                onSelect(r);
                setQ(r.display_name);
                setOpen(false);
                setSearchDone(false);
              }}
              className="w-full text-left px-3 py-2.5 hover:bg-accent text-sm border-b last:border-0 transition-colors"
            >
              <div className="flex items-start gap-2">
                <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                <span className="line-clamp-2">{r.display_name}</span>
              </div>
            </button>
          ))}
        </div>
      )}
      {/* No results message */}
      {open && searchDone && results.length === 0 && q.length >= 3 && !loading && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-lg shadow-lg p-3">
          <p className="text-sm text-muted-foreground text-center">
            No locations found for "{q}"
          </p>
          <p className="text-xs text-muted-foreground text-center mt-1">
            Try a nearby town name or landmark
          </p>
        </div>
      )}
    </div>
  );
}
