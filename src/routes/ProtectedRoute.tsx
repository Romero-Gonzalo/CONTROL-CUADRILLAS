import { Navigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import type { Role } from "../types/auth";

export default function ProtectedRoute({
  children,
  allow,
}: {
  children: React.ReactNode;
  allow: Role[];
}) {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;

  if (!profile) return <div className="p-6 text-red-600">Perfil no encontrado.</div>;

  if (!allow.includes(profile.role)) return <Navigate to="/" replace />;

  return <>{children}</>;
}