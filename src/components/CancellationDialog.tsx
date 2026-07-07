import { useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle } from "lucide-react";

const CUSTOMER_REASONS = [
  "Captain did not arrive",
  "Captain is too far",
  "Wrong pickup location",
  "Captain not moving",
  "Booked by mistake",
  "Plans changed",
  "Other",
];

const CAPTAIN_REASONS = [
  "Customer not reachable",
  "Wrong/unsafe pickup location",
  "Vehicle issue",
  "Personal emergency",
  "Customer asked to cancel",
  "Other",
];

export function CancellationDialog({
  open,
  onOpenChange,
  role,
  onConfirm,
  warning,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  role: "customer" | "captain";
  onConfirm: (reason: string) => void;
  warning?: string;
}) {
  const [reason, setReason] = useState<string | null>(null);
  const reasons = role === "captain" ? CAPTAIN_REASONS : CUSTOMER_REASONS;

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Cancel ride?</AlertDialogTitle>
          <AlertDialogDescription>
            Please tell us why. {role === "captain" && "Frequent cancellations lower your rating."}
          </AlertDialogDescription>
        </AlertDialogHeader>

        {warning && (
          <div className="flex items-start gap-2 bg-destructive/10 text-destructive rounded-lg p-3 text-sm">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <span>{warning}</span>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2 py-2">
          {reasons.map((r) => (
            <Button
              key={r}
              type="button"
              variant={reason === r ? "default" : "outline"}
              className="justify-start h-auto py-2"
              onClick={() => setReason(r)}
            >
              {r}
            </Button>
          ))}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setReason(null)}>Keep ride</AlertDialogCancel>
          <AlertDialogAction
            disabled={!reason}
            onClick={() => {
              if (reason) {
                onConfirm(reason);
                setReason(null);
              }
            }}
          >
            Confirm cancel
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
