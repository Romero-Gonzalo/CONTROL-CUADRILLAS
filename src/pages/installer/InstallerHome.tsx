import { useEffect, useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../../lib/firebase";
import { useAuth } from "../../app/AuthProvider";
import {
  createInstallation,
  updateInstallationWorkflow,
  updateInstallation,
} from "../../services/installations.service";
import {
  collection,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { db } from "../../lib/firebase";
import { getDayKey } from "../../utils/dayKey";
import { getReadableNowTimestamp, sendInstallationToMake } from "../../services/makeWebhook.service";
import type { WorkflowStatus } from "../../types/installationStatus";

type InstallationItem = {
  id: string;
  idInstalacion: string;
  observaciones: string;
  workflowStatus?: WorkflowStatus;
  resolutionComment?: string;
  source?: string;
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
  const [successMessage, setSuccessMessage] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editIdInstalacion, setEditIdInstalacion] = useState("");
  const [editObservaciones, setEditObservaciones] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [workflowError, setWorkflowError] = useState("");
  const [resolutionDrafts, setResolutionDrafts] = useState<Record<string, string>>({});
  const [savingWorkflowId, setSavingWorkflowId] = useState<string | null>(null);

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
    setSuccessMessage("");
    setWorkflowError("");

    try {
      const idValue = idInstalacion.trim();
      const dayKey = getDayKey();
      const makePayload = {
        fecha: getReadableNowTimestamp(),
        cuadrilla: profile.squadId || profile.displayName || "",
        idInstalacion: idValue,
        observaciones: observaciones.trim(),
        usuario: profile.displayName || user.email || user.uid,
        dayKey,
        estado: "PENDIENTE" as const,
        origen: "INSTALADOR" as const,
      };

      await createInstallation({
        idInstalacion: idValue,
        observaciones,
        squadId: profile.squadId!,
        userId: user.uid,
      });

      try {
        await sendInstallationToMake(makePayload);
      } catch (error) {
        console.error("Error enviando instalación al webhook de Make:", {
          error,
          payload: makePayload,
        });
      }

      setSuccessMessage("Registro guardado.");

      setIdInstalacion("");
      setObservaciones("");
    } catch {
      setError("Error al guardar la instalación.");
    } finally {
      setSaving(false);
    }
  }

  function startEdit(item: InstallationItem) {
    setEditingId(item.id);
    setEditIdInstalacion(item.idInstalacion || "");
    setEditObservaciones(item.observaciones || "");
    setError("");
  }

  function cancelEdit() {
    setEditingId(null);
    setEditIdInstalacion("");
    setEditObservaciones("");
  }

  async function onSaveEdit(itemId: string) {
    if (!editIdInstalacion.trim()) {
      setError("El ID de instalación es obligatorio");
      return;
    }

    setSavingEdit(true);
    setError("");

    try {
      await updateInstallation({
        id: itemId,
        idInstalacion: editIdInstalacion,
        observaciones: editObservaciones,
      });
      cancelEdit();
    } catch {
      setError("Error al editar la instalación");
    } finally {
      setSavingEdit(false);
    }
  }

  async function onSetWorkflowStatus(item: InstallationItem, status: WorkflowStatus) {
    const resolutionComment = (resolutionDrafts[item.id] ?? "").trim();

    if (status !== "SOLUCIONADO" && !resolutionComment) {
      setWorkflowError("Para No solucionado o Rechazado, el comentario es obligatorio.");
      return;
    }

    if (!user) return;

    setSavingWorkflowId(item.id);
    setWorkflowError("");
    setError("");

    try {
      await updateInstallationWorkflow({
        id: item.id,
        workflowStatus: status,
        resolutionComment,
        resolvedBy: user.uid,
      });

      if (profile) {
        const makePayload = {
          fecha: getReadableNowTimestamp(),
          cuadrilla: profile.squadId || profile.displayName || "",
          idInstalacion: item.idInstalacion,
          observaciones: resolutionComment || item.observaciones || "",
          usuario: profile.displayName || user.email || user.uid,
          dayKey: getDayKey(),
          estado: status,
          origen: "INSTALADOR" as const,
        };

        try {
          await sendInstallationToMake(makePayload);
        } catch (error) {
          console.error("Error enviando actualización de estado al webhook de Make:", {
            error,
            payload: makePayload,
          });
        }
      }
    } catch {
      setWorkflowError("No se pudo actualizar el estado de la instalación.");
    } finally {
      setSavingWorkflowId(null);
    }
  }

  const pendingItems = items.filter((item) => (item.workflowStatus ?? "PENDIENTE") === "PENDIENTE");

  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6 max-w-3xl mx-auto">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <h1 className="text-xl sm:text-2xl font-bold leading-tight">{profile?.displayName}</h1>

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

        {successMessage && (
          <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-xl p-3">
            {successMessage}
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

        <p className="text-xs text-gray-500">
          Al guardar, se registra en Firestore y también se envía el registro al webhook de Make.
        </p>

        <button
          disabled={saving}
          className="w-full sm:w-auto rounded-xl bg-black text-white px-4 py-2 font-medium disabled:opacity-50"
        >
          {saving ? "Guardando..." : "Guardar"}
        </button>
      </form>

      <div className="rounded-2xl border p-4">
        <h2 className="font-semibold mb-3">Instalaciones pendientes asignadas</h2>

        {workflowError && (
          <div className="mb-3 text-sm text-red-700 bg-red-50 border border-red-200 rounded-xl p-3">
            {workflowError}
          </div>
        )}

        {pendingItems.length === 0 ? (
          <p className="text-sm text-gray-500">
            No hay pendientes asignadas para hoy.
          </p>
        ) : (
          <ul className="space-y-2">
            {pendingItems.map((it) => (
              <li key={it.id} className="text-sm border rounded-xl p-3 space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                  <div className="font-medium">{it.idInstalacion}</div>
                  <div className="text-xs text-gray-500">
                    {it.source === "AUDITOR_PRELOAD" ? "Asignada por auditor" : "Carga manual"}
                  </div>
                </div>

                <textarea
                  className="w-full border rounded-xl px-3 py-2"
                  value={resolutionDrafts[it.id] ?? ""}
                  onChange={(e) =>
                    setResolutionDrafts((prev) => ({
                      ...prev,
                      [it.id]: e.target.value,
                    }))
                  }
                  placeholder="Comentario (obligatorio para no solucionado/rechazado)"
                />

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={savingWorkflowId === it.id}
                    onClick={() => void onSetWorkflowStatus(it, "SOLUCIONADO")}
                    className="rounded-lg border border-green-300 text-green-800 px-3 py-1.5 text-xs"
                  >
                    Solucionado
                  </button>
                  <button
                    type="button"
                    disabled={savingWorkflowId === it.id}
                    onClick={() => void onSetWorkflowStatus(it, "NO_SOLUCIONADO")}
                    className="rounded-lg border border-yellow-300 text-yellow-800 px-3 py-1.5 text-xs"
                  >
                    No solucionado
                  </button>
                  <button
                    type="button"
                    disabled={savingWorkflowId === it.id}
                    onClick={() => void onSetWorkflowStatus(it, "RECHAZADO")}
                    className="rounded-lg border border-red-300 text-red-700 px-3 py-1.5 text-xs"
                  >
                    Rechazado
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border p-4">
        <h2 className="font-semibold mb-3">Instalaciones de hoy</h2>

        {items.length === 0 ? (
          <p className="text-sm text-gray-500">Todavía no hay instalaciones cargadas.</p>
        ) : (
          <ul className="space-y-2">
            {items.map((it, idx) => {
              const next = items[idx + 1];
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
              const isEditing = editingId === it.id;

              return (
                <li key={it.id} className="text-sm border rounded-xl p-3 space-y-2">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1 sm:gap-3">
                    <div className="font-medium">{isEditing ? "Editando" : it.idInstalacion}</div>
                    <div className="text-xs text-gray-500 flex items-center gap-2">
                      <span>{fmtTime(it.createdAt)}</span>
                      <span className="border rounded px-1.5 py-0.5">
                        {it.workflowStatus ?? "PENDIENTE"}
                      </span>
                    </div>
                  </div>

                  {isEditing ? (
                    <>
                      <div className="space-y-2">
                        <label className="text-xs font-medium">ID de instalación</label>
                        <input
                          className="w-full border rounded-xl px-3 py-2"
                          value={editIdInstalacion}
                          onChange={(e) => setEditIdInstalacion(e.target.value)}
                          placeholder="IPT-12345"
                        />
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-medium">Observaciones</label>
                        <textarea
                          className="w-full border rounded-xl px-3 py-2"
                          value={editObservaciones}
                          onChange={(e) => setEditObservaciones(e.target.value)}
                          placeholder="Opcional"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={savingEdit}
                          onClick={() => void onSaveEdit(it.id)}
                          className="rounded-xl bg-black text-white px-3 py-2 font-medium disabled:opacity-50"
                        >
                          {savingEdit ? "Guardando..." : "Guardar cambios"}
                        </button>
                        <button
                          type="button"
                          onClick={cancelEdit}
                          className="rounded-xl border px-3 py-2"
                        >
                          Cancelar
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      {it.observaciones && <div className="text-gray-600 mt-1">{it.observaciones}</div>}

                      <div className="flex flex-wrap items-center gap-2">
                        {gapText && (
                          <div className="text-xs text-gray-700 bg-gray-50 border rounded-lg px-2 py-1 inline-block">
                            Tiempo desde la anterior: <span className="font-medium">{gapText}</span>
                          </div>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(it)}
                          className="text-xs rounded-lg border px-2 py-1"
                        >
                          Editar
                        </button>
                      </div>
                    </>
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
