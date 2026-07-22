import { useAuth } from "@/hooks/useAuth";
import { Navigate } from "react-router-dom";
import CustomerHome from "./CustomerHome";
import CaptainDashboard from "./CaptainDashboard";
import { Loader2 } from "lucide-react";

export default function Index() {
  const { user, activeRole, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  if (activeRole === "admin") return <Navigate to="/admin" replace />;
  if (activeRole === "captain") return <CaptainDashboard />;
  return <CustomerHome />;
}
