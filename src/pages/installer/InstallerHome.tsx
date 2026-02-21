import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../app/AuthProvider";
import { createInstallation } from "../../services/installations.service";
import {
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getDayKey } from "../../utils/dayKey";

type InstallationItem = {
  id: string;
  idInstalacion: string;
  observaciones: string;
  createdAt?: any;
};
function fmtTime(ts: any) {
  if (!ts?.toDate) return "";
  const d = ts.toDate() as Date;
  return d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" });
}

function fmtGapMinutes(min: number) {
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}
export default function InstallerHome() {
  const { profile, user } = useAuth();
  const [idInstalacion, setIdInstalacion] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [saving, setSaving] = useState(false);
  const [items, setItems] = useState<InstallationItem[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!profile?.squadId) return;

    const q = query(
      collection(db, "installations"),
      where("squadId", "==", profile.squadId),
      where("dayKey", "==", getDayKey()),
      orderBy("createdAt", "desc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      }));
      setItems(rows);
    });

    return () => unsub();
  }, [profile?.squadId]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!idInstalacion.trim()) {
      setError("El ID de instalación es obligatorio");
      return;
    }
    if (!profile || !user) return;

    setSaving(true);
    setError("");

    try {
      await createInstallation({
        idInstalacion,
        observaciones,
        squadId: profile.squadId!,
        userId: user.uid,
      });

      setIdInstalacion("");
      setObservaciones("");
    } catch (err) {
      setError("Error al guardar la instalación");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold leading-tight">
          {profile?.displayName}
        </h1>
        <button
          className="w-full sm:w-auto px-3 py-2 rounded-xl border"
          onClick={() => signOut(auth)}
        >
          Salir
        </button>
      </div>

      <form onSubmit={onSubmit} className="rounded-2xl border p-4 space-y-4">
        <h2 className="font-semibold">Nueva instalación</h2>

        {error && (
          <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {error}
          </div>
        )}

        <div className="space-y-2">
          <label className="text-sm font-medium">ID de instalación</label>
          <input
            className="w-full border rounded-xl px-3 py-2"
            value={idInstalacion}
            onChange={(e) => setIdInstalacion(e.target.value)}
            placeholder="IPT-12345"
          />
        </div>

        <div className="space-y-2">
          <label className="text-sm font-medium">Observaciones</label>
          <textarea
            className="w-full border rounded-xl px-3 py-2"
            value={observaciones}
            onChange={(e) => setObservaciones(e.target.value)}
            placeholder="Opcional"
          />
        </div>

        <button
          disabled={saving}
          className="w-full sm:w-auto rounded-xl bg-black text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </form>

      <div className="rounded-2xl border p-4">
        <h2 className="font-semibold mb-3">Instalaciones de hoy</h2>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500">
            Todavía no hay instalaciones cargadas.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => {
              const next = items[idx + 1]; // "anterior" en el tiempo (porque está DESC)
              const t1 = it.createdAt?.toDate?.() as Date | undefined;
              const t0 = next?.createdAt?.toDate?.() as Date | undefined;

              let gapText = "";
              if (t1 && t0) {
                const diffMin = Math.max(
                  0,
                  Math.round((t1.getTime() - t0.getTime()) / 60000),
                );
                gapText = fmtGapMinutes(diffMin);
              }

              return (
                <li key={it.id} className="text-sm border rounded-xl p-3">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                    <div className="font-medium">{it.idInstalacion}</div>
                    <div className="text-xs text-gray-500">
                      {fmtTime(it.createdAt)}
                    </div>
                  </div>

                  {it.observaciones && (
                    <div className="text-gray-600 mt-1">{it.observaciones}</div>
                  )}

                  {gapText && (
                    <div className="mt-2 text-xs text-gray-700 bg-gray-50 border rounded-lg px-2 py-1 inline-block">
                      Tiempo desde la anterior:{" "}
                      <span className="font-medium">{gapText}</span>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
