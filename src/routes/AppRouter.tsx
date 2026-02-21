import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "../app/AuthProvider";
import Login from "../pages/auth/Login";
import InstallerHome from "../pages/installer/InstallerHome";
import AuditorHome from "../pages/auditor/AuditorHome";
import ProtectedRoute from "./ProtectedRoute";

function HomeRedirect() {
  const { user, profile, loading } = useAuth();

  if (loading) return <div className="p-6">Cargando...</div>;
  if (!user) return <Navigate to="/login" replace />;
  if (!profile) return <div className="p-6 text-red-600">Perfil no encontrado.</div>;

  if (profile.role === "AUDITOR") return <Navigate to="/auditor" replace />;
  return <Navigate to="/installer" replace />;
}

export default function AppRouter() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<HomeRedirect />} />
        <Route path="/login" element={<Login />} />

        <Route
          path="/installer"
          element={
            <ProtectedRoute allow={["INSTALLER"]}>
              <InstallerHome />
            </ProtectedRoute>
          }
        />

        <Route
          path="/auditor"
          element={
            <ProtectedRoute allow={["AUDITOR"]}>
              <AuditorHome />
            </ProtectedRoute>
          }
        />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}