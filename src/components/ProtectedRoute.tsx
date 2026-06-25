import { useAuth } from "@/hooks/useAuth";
import { Navigate, Outlet } from "react-router-dom";
import { LoadingSpinner } from "@/components/LoadingSpinner";

export function ProtectedRoute() {
  const { user, loading } = useAuth();
  if (loading) {
    return <LoadingSpinner message="Checking authentication" messageTa="விவரங்கள் சரிபார்க்கப்படுகின்றன..." />;
  }
  if (!user) return <Navigate to="/auth" replace />;
  return <Outlet />;
}
