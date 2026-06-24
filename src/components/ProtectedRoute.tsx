import { useApp } from "@/contexts/AppContext";
import { Navigate, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

export default function ProtectedRoute({
  children,
  requiredRole,
}: {
  children: JSX.Element;
  requiredRole?: "admin";
}) {
  const { user, loading, isAdmin } = useApp();
  const loc = useLocation();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
  if (!user) return <Navigate to="/auth" replace state={{ from: loc.pathname }} />;
  if (requiredRole === "admin" && !isAdmin) {
    toast.error("Admin yetkisi gerekli");
    return <Navigate to="/" replace />;
  }
  return children;
}
