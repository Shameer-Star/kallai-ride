import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

const QUICK_FEEDBACK = [
  { label: "Safe driving", emoji: "🛡️" },
  { label: "Polite", emoji: "😊" },
  { label: "On time", emoji: "⏰" },
  { label: "Clean vehicle", emoji: "✨" },
  { label: "Good route", emoji: "🗺️" },
  { label: "Smooth ride", emoji: "🏍️" },
];

export function RatingDialog({
  open,
  onOpenChange,
  rideId,
  customerId,
  captainId,
  fare,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  rideId: string;
  customerId: string;
  captainId: string;
  fare: number;
}) {
  const [stars, setStars] = useState(0);
  const [comment, setComment] = useState("");
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  function toggleChip(label: string) {
    setSelectedChips((prev) =>
      prev.includes(label) ? prev.filter((c) => c !== label) : [...prev, label]
    );
  }

  async function submit() {
    if (stars < 1) {
      toast.error("Please select stars");
      return;
    }
    setSaving(true);
    const fullComment = [
      ...selectedChips,
      comment.trim(),
    ].filter(Boolean).join(". ") || null;
    
    const { error } = await supabase.from("ratings").insert({
      ride_id: rideId,
      customer_id: customerId,
      captain_id: captainId,
      stars,
      comment: fullComment,
    });
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Thanks for your feedback!");
    onOpenChange(false);
    setStars(0);
    setComment("");
    setSelectedChips([]);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Rate your ride · சவாரியை மதிப்பிடுங்கள்</DialogTitle>
          <DialogDescription>
            Ride completed · ₹{fare} paid. How was your captain?
          </DialogDescription>
        </DialogHeader>

        {/* Stars */}
        <div className="flex justify-center gap-2 py-3">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStars(s)}
              className="transition-all duration-200 hover:scale-125 active:scale-95"
            >
              <Star
                className={`h-10 w-10 transition-all duration-200 ${
                  s <= stars ? "fill-yellow-500 text-yellow-500 drop-shadow-md" : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>

        {/* Rating label */}
        {stars > 0 && (
          <div className="text-center text-sm font-semibold animate-in fade-in zoom-in-95">
            {stars === 5 && "🌟 Excellent!"}
            {stars === 4 && "😄 Great!"}
            {stars === 3 && "🙂 Good"}
            {stars === 2 && "😐 Average"}
            {stars === 1 && "😞 Poor"}
          </div>
        )}

        {/* Quick feedback chips */}
        {stars > 0 && (
          <div className="flex flex-wrap gap-1.5 justify-center animate-in fade-in slide-in-from-bottom-2">
            {QUICK_FEEDBACK.map((chip) => (
              <button
                key={chip.label}
                type="button"
                onClick={() => toggleChip(chip.label)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-200 border ${
                  selectedChips.includes(chip.label)
                    ? "bg-primary text-primary-foreground border-primary shadow-sm scale-105"
                    : "bg-muted border-border hover:bg-muted/80"
                }`}
              >
                {chip.emoji} {chip.label}
              </button>
            ))}
          </div>
        )}

        <Textarea
          placeholder="Optional comment (e.g. polite, safe driving)"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 280))}
          rows={2}
        />
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Skip
          </Button>
          <Button onClick={submit} disabled={saving || stars < 1}>
            Submit rating
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
