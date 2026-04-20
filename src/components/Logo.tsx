import { Bike } from "lucide-react";

export function Logo({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const px = size === "lg" ? "h-12 w-12" : size === "sm" ? "h-8 w-8" : "h-10 w-10";
  const text = size === "lg" ? "text-3xl" : size === "sm" ? "text-lg" : "text-xl";
  return (
    <div className="flex items-center gap-2">
      <div className={`${px} rounded-xl bg-primary flex items-center justify-center shadow-[var(--shadow-elegant)]`}>
        <Bike className="h-5 w-5 text-primary-foreground" strokeWidth={2.5} />
      </div>
      <div className="flex flex-col leading-tight">
        <span className={`${text} font-extrabold tracking-tight`}>
          Adhaiyu<span className="text-primary"> Ride</span>
        </span>
        <span className="text-[10px] text-muted-foreground -mt-0.5">அதையூர் சவாரி</span>
      </div>
    </div>
  );
}
