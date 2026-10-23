import { AuthRouteLoader } from "@/components/auth/AuthLoadingState";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/providers/AuthProvider";
import { hasRole, type AppRole } from "@/lib/roles";

export function RequireAuth({ children }: { children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthRouteLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  return children;
}

export function RequireRole({ role, children }: { role: AppRole; children: JSX.Element }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return <AuthRouteLoader />;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (!hasRole(user.role, role)) return <Navigate to="/" replace />;
  return children;
}
