import { useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

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
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (stars < 1) {
      toast.error("Please select stars");
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("ratings").insert({
      ride_id: rideId,
      customer_id: customerId,
      captain_id: captainId,
      stars,
      comment: comment.trim() || null,
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
        <div className="flex justify-center gap-2 py-4">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setStars(s)}
              className="transition-transform hover:scale-110"
            >
              <Star
                className={`h-10 w-10 ${
                  s <= stars ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground"
                }`}
              />
            </button>
          ))}
        </div>
        <Textarea
          placeholder="Optional comment (e.g. polite, safe driving)"
          value={comment}
          onChange={(e) => setComment(e.target.value.slice(0, 280))}
          rows={3}
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
