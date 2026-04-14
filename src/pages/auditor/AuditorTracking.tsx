import { useEffect, useMemo, useState } from "react";
import {
  collection,
  onSnapshot,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getDayKey } from "../../utils/dayKey";
import { auditInstallation } from "../../services/installations.service";
import type {
  InstallationReason,
  InstallationStatus,
} from "../../types/installationStatus";

type InstallationItem = {
  id: string;
  idInstalacion: string;
  squadId: string;
  observaciones: string;
  provisionalStatus?: InstallationStatus;
  provisionalReason?: InstallationReason | "";
  auditorStatus?: InstallationStatus | "";
  auditorReason?: InstallationReason | "";
  auditorComment?: string;
  audited?: boolean;
};

export default function AuditorTracking() {
  const [items, setItems] = useState<InstallationItem[]>([]);
  const [searchId, setSearchId] = useState("");
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [auditorStatusDraft, setAuditorStatusDraft] = useState<
    Record<string, string>
  >({});
  const [auditorReasonDraft, setAuditorReasonDraft] = useState<
    Record<string, string>
  >({});
  const [auditorCommentDraft, setAuditorCommentDraft] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const q = query(
      collection(db, "installations"),
      where("dayKey", "==", getDayKey()),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({
        id: d.id,
        ...(d.data() as any),
      })) as InstallationItem[];

      setItems(rows);
    });

    return () => unsub();
  }, []);

  const filteredItems = useMemo(() => {
    const value = searchId.trim().toLowerCase();
    if (!value) return items;

    return items.filter((item) =>
      String(item.idInstalacion ?? "").toLowerCase().includes(value),
    );
  }, [items, searchId]);

  async function onAuditSave(item: InstallationItem) {
    const auditorStatus =
      auditorStatusDraft[item.id] ||
      item.auditorStatus ||
      item.provisionalStatus ||
      "";

    const auditorReason =
      auditorReasonDraft[item.id] || item.auditorReason || "";

    const auditorComment =
      auditorCommentDraft[item.id] || item.auditorComment || "";

    if (!auditorStatus) {
      setError("El estado final es obligatorio");
      return;
    }

    if (auditorStatus !== "FINALIZADA" && !auditorReason) {
      setError("El motivo es obligatorio cuando no está finalizada");
      return;
    }

    setSavingId(item.id);
    setError("");

    try {
      await auditInstallation({
        id: item.id,
        auditorStatus: auditorStatus as InstallationStatus,
        auditorReason: auditorReason as InstallationReason | "",
        auditorComment,
      });
    } catch {
      setError("No se pudo guardar la auditoría");
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-6 space-y-4">
      <h1 className="text-2xl font-bold">Seguimiento de instalaciones</h1>

      {error && (
        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
          {error}
        </div>
      )}

      <input
        className="w-full border rounded-xl px-3 py-2"
        placeholder="Buscar por ID"
        value={searchId}
        onChange={(e) => setSearchId(e.target.value)}
      />

      <div className="space-y-3">
        {filteredItems.length === 0 ? (
          <div className="rounded-xl border p-4 text-sm text-gray-500">
            No hay resultados.
          </div>
        ) : (
          filteredItems.map((item) => {
            const currentAuditorStatus =
              auditorStatusDraft[item.id] ??
              item.auditorStatus ??
              item.provisionalStatus ??
              "";

            return (
              <div key={item.id} className="rounded-2xl border p-4 space-y-3">
                <div className="flex flex-col gap-1">
                  <div className="font-semibold">{item.idInstalacion}</div>
                  <div className="text-sm text-gray-600">
                    Cuadrilla: {item.squadId}
                  </div>
                  <div className="text-sm">
                    Estado cuadrilla:{" "}
                    <strong>{item.provisionalStatus || "Sin definir"}</strong>
                  </div>

                  {item.provisionalReason && (
                    <div className="text-sm">
                      Motivo cuadrilla: {item.provisionalReason}
                    </div>
                  )}

                  {item.observaciones && (
                    <div className="text-sm text-gray-700">
                      Obs: {item.observaciones}
                    </div>
                  )}
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Estado final</label>
                    <select
                      className="w-full border rounded-xl px-3 py-2"
                      value={currentAuditorStatus}
                      onChange={(e) =>
                        setAuditorStatusDraft((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seleccionar</option>
                      <option value="FINALIZADA">Finalizada</option>
                      <option value="PENDIENTE">Pendiente</option>
                      <option value="NO_SOLUCIONADA">No solucionada</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Motivo final</label>
                    <select
                      className="w-full border rounded-xl px-3 py-2"
                      value={auditorReasonDraft[item.id] ?? item.auditorReason ?? ""}
                      onChange={(e) =>
                        setAuditorReasonDraft((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Seleccionar motivo</option>
                      <option value="NO_ATENDIO">No atendió</option>
                      <option value="NO_ESTABAN">No estaban</option>
                      <option value="RECHAZA_SERVICIO">Rechaza servicio</option>
                      <option value="RECOORDINAR">Recoordinar</option>
                      <option value="OTRO">Otro</option>
                    </select>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Comentario auditor</label>
                    <input
                      className="w-full border rounded-xl px-3 py-2"
                      value={auditorCommentDraft[item.id] ?? item.auditorComment ?? ""}
                      onChange={(e) =>
                        setAuditorCommentDraft((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      placeholder="Opcional"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => onAuditSave(item)}
                    disabled={savingId === item.id}
                    className="rounded-xl bg-black text-white px-4 py-2 disabled:opacity-50"
                  >
                    {savingId === item.id ? "Guardando..." : "Confirmar estado"}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}