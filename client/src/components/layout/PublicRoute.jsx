import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "../../context/useAuth";
import { LoadingSpinner } from "../common/LoadingSpinner";

export function PublicRoute() {
  const { isAuthenticated, loading } = useAuth();

  if (loading) {
    return <LoadingSpinner fullScreen message="Loading SplitMate..." />;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
