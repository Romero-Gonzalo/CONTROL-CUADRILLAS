import { useState } from "react";
import { signInWithEmailAndPassword } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../app/AuthProvider";
import { Navigate } from "react-router-dom";

export default function Login() {
  const { user, loading, error } = useAuth();
  const [email, setEmail] = useState("");
  const [pass, setPass] = useState("");
  const [localError, setLocalError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (!loading && user) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError("");
    setSubmitting(true);

    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (err: any) {
      setLocalError(err?.message ?? "Error al iniciar sesión");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={onSubmit} className="w-full max-w-md bg-white rounded-2xl shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold">IPT · Control de Cuadrillas</h1>

        {(error || localError) && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error || localError}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">Email</label>
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="cuadrilla01@internetparatodos.com"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Contraseña</label>
          <input
            className="w-full border rounded-xl px-3 py-2"
            type="password"
            value={pass}
            onChange={(e) => setPass(e.target.value)}
            placeholder="••••••••"
          />
        </div>

        <button
          disabled={submitting}
          className="w-full rounded-xl bg-black text-white py-2 font-medium disabled:opacity-50"
        >
          {submitting ? "Ingresando..." : "Ingresar"}
        </button>

        <p className="text-xs text-gray-500">
          Entrá con la cuenta de tu cuadrilla o auditor.
        </p>
      </form>
    </div>
  );
}