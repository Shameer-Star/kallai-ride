import { useAuth, AppRole } from "@/hooks/useAuth";
import { Bike, User } from "lucide-react";

export function RoleSwitcher() {
  const { roles, activeRole, switchRole } = useAuth();

  // Only show if user has both customer and captain roles
  const hasDual = roles.includes("customer") && roles.includes("captain");
  if (!hasDual || activeRole === "admin") return null;

  return (
    <div className="flex items-center bg-muted rounded-full p-0.5 gap-0.5">
      <button
        type="button"
        onClick={() => switchRole("customer")}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
          activeRole === "customer"
            ? "bg-primary text-primary-foreground shadow-sm scale-105"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <User className="h-3 w-3" />
        <span>Ride</span>
      </button>
      <button
        type="button"
        onClick={() => switchRole("captain")}
        className={`flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold transition-all duration-300 ${
          activeRole === "captain"
            ? "bg-primary text-primary-foreground shadow-sm scale-105"
            : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Bike className="h-3 w-3" />
        <span>Drive</span>
      </button>
    </div>
  );
}
