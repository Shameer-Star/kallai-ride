import { Link, useLocation } from "react-router-dom";
import { Logo } from "./Logo";
import { Button } from "./ui/button";
import { useAuth } from "@/hooks/useAuth";
import { History, LogOut, Home } from "lucide-react";

export function AppHeader() {
  const { signOut, role } = useAuth();
  const loc = useLocation();
  return (
    <header className="sticky top-0 z-40 bg-background/95 backdrop-blur border-b">
      <div className="flex items-center justify-between px-4 h-14">
        <Link to="/"><Logo size="sm" /></Link>
        <div className="flex items-center gap-1">
          {role && (
            <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-1 rounded bg-secondary text-secondary-foreground mr-1">
              {role}
            </span>
          )}
          <Link to="/">
            <Button variant={loc.pathname === "/" ? "default" : "ghost"} size="icon">
              <Home className="h-4 w-4" />
            </Button>
          </Link>
          <Link to="/history">
            <Button variant={loc.pathname === "/history" ? "default" : "ghost"} size="icon">
              <History className="h-4 w-4" />
            </Button>
          </Link>
          <Button variant="ghost" size="icon" onClick={signOut}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </header>
  );
}
