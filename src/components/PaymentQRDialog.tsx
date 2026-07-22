import { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CheckCircle2, QrCode, IndianRupee, Copy } from "lucide-react";
import QRCode from "qrcode";
import { toast } from "sonner";

interface PaymentQRDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  fare: number;
  captainName: string;
  captainUpiId: string;
  rideId: string;
}

export function PaymentQRDialog({
  open,
  onOpenChange,
  fare,
  captainName,
  captainUpiId,
  rideId,
}: PaymentQRDialogProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [generated, setGenerated] = useState(false);

  const upiLink = `upi://pay?pa=${encodeURIComponent(captainUpiId)}&pn=${encodeURIComponent(captainName)}&am=${fare}&cu=INR&tn=KallaiRide-${rideId.slice(0, 8)}`;

  useEffect(() => {
    if (!open || !canvasRef.current || !captainUpiId) return;
    setGenerated(false);
    QRCode.toCanvas(
      canvasRef.current,
      upiLink,
      {
        width: 240,
        margin: 2,
        color: { dark: "#111827", light: "#FFFFFF" },
      },
      (err) => {
        if (!err) setGenerated(true);
        else console.error("QR generation error:", err);
      }
    );
  }, [open, upiLink, captainUpiId]);

  function copyUpiId() {
    navigator.clipboard.writeText(captainUpiId).then(() => {
      toast.success("UPI ID copied!");
    }).catch(() => {
      toast.error("Failed to copy");
    });
  }

  if (!captainUpiId) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Payment · கட்டணம்</DialogTitle>
            <DialogDescription>Ride completed! Pay the captain directly.</DialogDescription>
          </DialogHeader>
          <div className="text-center space-y-3 py-4">
            <div className="text-4xl font-extrabold text-primary">₹{fare}</div>
            <p className="text-sm text-muted-foreground">
              Captain hasn't set their UPI ID. Please pay cash directly.
            </p>
            <Button onClick={() => onOpenChange(false)} className="w-full h-11 font-bold">
              <CheckCircle2 className="h-4 w-4 mr-1" /> Done
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-primary" />
            Pay Captain · கட்டணம்
          </DialogTitle>
          <DialogDescription>Scan the QR code to pay via UPI</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center space-y-4 py-2">
          {/* Fare amount */}
          <div className="flex items-center gap-1 bg-primary/10 border-2 border-primary/30 rounded-2xl px-6 py-3">
            <IndianRupee className="h-6 w-6 text-primary" />
            <span className="text-3xl font-extrabold text-primary">{fare}</span>
          </div>

          {/* QR Code */}
          <div className="relative bg-white rounded-2xl p-4 shadow-lg border-2 border-muted">
            <canvas ref={canvasRef} className="rounded-lg" />
            {!generated && (
              <div className="absolute inset-0 flex items-center justify-center bg-white/80 rounded-2xl">
                <div className="animate-spin h-6 w-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            )}
          </div>

          {/* Captain info */}
          <div className="text-center space-y-1">
            <div className="text-sm font-bold">{captainName}</div>
            <button
              type="button"
              onClick={copyUpiId}
              className="flex items-center gap-1 mx-auto text-xs text-muted-foreground hover:text-foreground transition-colors"
            >
              <span className="font-mono bg-muted px-2 py-0.5 rounded">{captainUpiId}</span>
              <Copy className="h-3 w-3" />
            </button>
          </div>

          {/* Open UPI app */}
          <a href={upiLink} className="w-full">
            <Button className="w-full h-11 font-bold glow-button">
              <IndianRupee className="h-4 w-4 mr-1" /> Pay ₹{fare} via UPI App
            </Button>
          </a>

          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            className="w-full"
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> I've Paid / Pay Cash
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
