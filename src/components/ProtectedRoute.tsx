import { useApp } from "@/contexts/AppContext";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";

export default function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: JSX.Element;
  requiredRole?: "admin";
}) {
  const { user, loading, isAdmin } = useApp();
  const loc = useLocation();
  if (loading) return <div className="min-h-screen flex items-center justify-center text-muted-foreground">…</div>;
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  if (requiredRole === "admin" && !isAdmin) {
    toast.error("Admin yetkisi gerekli");
    return <Navigate to="/" replace />;
  }
  return children;
}
