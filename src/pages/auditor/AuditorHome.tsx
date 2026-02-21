import { useEffect, useMemo, useState } from "react";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../app/AuthProvider";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getDayKey } from "../../utils/dayKey";

type Squad = {
  id: string; // Q01, Q02...
  name: string;
  active: boolean;
};

type InstallationItem = {
  id: string;
  idInstalacion: string;
  observaciones: string;
  squadId: string;
  createdAt?: any; // Timestamp
};
function escCsv(value: any) {
  const s = String(value ?? "");
  // Escapa comillas y encierra en comillas si hay separadores o saltos
  const needsQuotes = /[",\n;]/.test(s);
  const safe = s.replace(/"/g, '""');
  return needsQuotes ? `"${safe}"` : safe;
}

function downloadTextFile(
  filename: string,
  content: string,
  mime = "text/csv;charset=utf-8",
) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
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
function calcGapsDesc(list: InstallationItem[]) {
  // list viene ordenada DESC (más nueva primero)
  const gapsMin: number[] = [];

  for (let i = 0; i < list.length - 1; i++) {
    const t1 = list[i].createdAt?.toDate?.() as Date | undefined;
    const t0 = list[i + 1].createdAt?.toDate?.() as Date | undefined;
    if (!t1 || !t0) continue;

    const diffMin = Math.max(
      0,
      Math.round((t1.getTime() - t0.getTime()) / 60000),
    );
    gapsMin.push(diffMin);
  }

  return gapsMin;
}

function avg(nums: number[]) {
  if (nums.length === 0) return 0;
  const sum = nums.reduce((a, b) => a + b, 0);
  return Math.round(sum / nums.length);
}

function max(nums: number[]) {
  if (nums.length === 0) return 0;
  return nums.reduce((m, v) => (v > m ? v : m), nums[0]);
}
function toDayKeyFromInput(value: string) {
  // value: "YYYY-MM-DD" desde <input type="date">
  return value;
}
export default function AuditorHome() {
  const { profile } = useAuth();

  const [squads, setSquads] = useState<Squad[]>([]);
  const [installations, setInstallations] = useState<InstallationItem[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);

  // Fecha para filtrar
  const [dayInput, setDayInput] = useState(() => getDayKey());
  const [searchId, setSearchId] = useState("");

  const dayKey = useMemo(() => toDayKeyFromInput(dayInput), [dayInput]);
  const searchResult = useMemo(() => {
    const q = searchId.trim().toLowerCase();
    if (!q) return null;

    return (
      installations.find((it) => it.idInstalacion?.toLowerCase() === q) ?? null
    );
  }, [searchId, installations]);
  // 1) Traer cuadrillas
  useEffect(() => {
    const q = query(collection(db, "squads"), where("active", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Squad[];
        // orden Q01..Q99
        rows.sort((a, b) => a.id.localeCompare(b.id));
        setSquads(rows);

        // si no hay seleccionada, elegimos la primera
        if (!selectedSquadId && rows.length > 0) setSelectedSquadId(rows[0].id);
      },
      (err) => console.error(err),
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2) Traer instalaciones del día (todas)
  useEffect(() => {
    const q = query(
      collection(db, "installations"),
      where("dayKey", "==", dayKey),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as InstallationItem[];

        rows.sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
          const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
          return tb - ta;
        });

        setInstallations(rows);
      },
      (err) => console.error(err),
    );

    return () => unsub();
  }, [dayKey]);
  // Conteo por cuadrilla
  const squadStats = useMemo(() => {
    // agrupamos por cuadrilla (y listamos DESC ya)
    const groups: Record<string, InstallationItem[]> = {};
    for (const it of installations) {
      (groups[it.squadId] ??= []).push(it);
    }

    for (const sid of Object.keys(groups)) {
      groups[sid].sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
    }

    const stats: Record<
      string,
      {
        count: number;
        lastAt: any | null;
        avgGapMin: number;
        maxGapMin: number;
      }
    > = {};

    for (const sid of Object.keys(groups)) {
      const list = groups[sid];
      const gaps = calcGapsDesc(list);
      stats[sid] = {
        count: list.length,
        lastAt: list[0]?.createdAt ?? null, // como está DESC, el primero es el más nuevo
        avgGapMin: avg(gaps),
        maxGapMin: max(gaps),
      };
    }

    return stats;
  }, [installations]);

  // Instalaciones de la cuadrilla seleccionada (ordenadas DESC ya)
  const selectedList = useMemo(() => {
    if (!selectedSquadId) return [];
    return installations.filter((x) => x.squadId === selectedSquadId);
  }, [installations, selectedSquadId]);

  const selectedSquadName = useMemo(() => {
    const s = squads.find((x) => x.id === selectedSquadId);
    return s?.name ?? selectedSquadId ?? "";
  }, [squads, selectedSquadId]);
  const exportCsv = () => {
    const squadNameById: Record<string, string> = {};
    for (const s of squads) squadNameById[s.id] = s.name;

    const rows = [...installations].sort((a, b) => {
      const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
      const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
      return ta - tb;
    });

    const header = [
      "Fecha",
      "CuadrillaID",
      "Cuadrilla",
      "Hora",
      "IDInstalacion",
      "Observaciones",
      "GapMinDesdeAnteriorMismaCuadrilla",
    ];

    const lastTimeBySquad: Record<string, number> = {};
    const lines: string[] = [];
    lines.push(header.join(";"));

    for (const it of rows) {
      const squadId = it.squadId ?? "";
      const squadName = squadNameById[squadId] ?? squadId;
      const d: Date | null = it.createdAt?.toDate?.() ?? null;

      const timeStr = d
        ? d.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit" })
        : "";

      let gapMin = "";
      if (d) {
        const prevMs = lastTimeBySquad[squadId];
        if (prevMs) {
          gapMin = String(
            Math.max(0, Math.round((d.getTime() - prevMs) / 60000)),
          );
        }
        lastTimeBySquad[squadId] = d.getTime();
      }

      const line = [
        escCsv(dayKey),
        escCsv(squadId),
        escCsv(squadName),
        escCsv(timeStr),
        escCsv(it.idInstalacion),
        escCsv(it.observaciones),
        escCsv(gapMin),
      ].join(";");

      lines.push(line);
    }

    const filename = `IPT_instalaciones_${dayKey}.csv`;
    downloadTextFile(filename, lines.join("\n"));
  };
  return (
    <div className="px-4 py-4 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_auto_auto] gap-3 items-start">
        <div className="rounded-2xl border p-4">
          <div className="text-sm font-medium mb-2">Buscar instalación</div>

          <input
            type="text"
            placeholder="Ej: IPT-12345"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />

          {searchId && (
            <div className="mt-3">
              {searchResult ? (
                <div className="border rounded-xl p-3 bg-green-50">
                  <div className="font-medium">
                    Instalación {searchResult.idInstalacion}
                  </div>

                  <div className="text-sm text-gray-700">
                    Cuadrilla:{" "}
                    <span className="font-medium">
                      {squads.find((s) => s.id === searchResult.squadId)
                        ?.name ?? searchResult.squadId}
                    </span>
                  </div>

                  <div className="text-sm text-gray-700">
                    Hora: {fmtTime(searchResult.createdAt)}
                  </div>

                  {searchResult.observaciones && (
                    <div className="text-sm text-gray-600 mt-1">
                      Obs: {searchResult.observaciones}
                    </div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">
                  No se encontró ninguna instalación con ese ID.
                </div>
              )}
            </div>
          )}
        </div>
        <div>
          <h1 className="text-xl sm:text-2xl font-bold leading-tight">
            {profile?.displayName ?? "Auditor"}
          </h1>
          <p className="text-sm text-gray-500">Panel diario por cuadrilla</p>
        </div>

        <div className="w-full lg:w-auto">
          <input
            type="date"
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={dayInput}
            onChange={(e) => setDayInput(e.target.value)}
          />
        </div>

        <div className="grid grid-cols-2 gap-2 w-full lg:w-auto">
          <button
            className="px-3 py-2 rounded-xl border text-sm"
            onClick={exportCsv}
            title="Exporta todas las instalaciones del día a CSV"
          >
            Exportar CSV
          </button>

          <button
            className="px-3 py-2 rounded-xl border text-sm"
            onClick={() => signOut(auth)}
          >
            Salir
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Fecha</div>
          <div className="text-xl font-bold">{dayKey}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Total instalaciones</div>
          <div className="text-xl font-bold">{installations.length}</div>
        </div>
        <div className="rounded-2xl border p-4">
          <div className="text-sm text-gray-500">Cuadrillas activas</div>
          <div className="text-xl font-bold">{squads.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Lista cuadrillas */}
        <div className="rounded-2xl border p-4">
          <h2 className="font-semibold mb-3">Cuadrillas</h2>

          <div className="space-y-2">
            {squads.map((s) => {
              const st = squadStats[s.id] ?? {
                count: 0,
                lastAt: null,
                avgGapMin: 0,
                maxGapMin: 0,
              };
              const active = selectedSquadId === s.id;
              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSquadId(s.id)}
                  className={[
                    "w-full text-left border rounded-xl p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2",
                    active ? "bg-black text-white border-black" : "bg-white",
                  ].join(" ")}
                >
                  <div>
                    <div className="font-medium">{s.name}</div>
                    <div
                      className={
                        active
                          ? "text-white/70 text-xs"
                          : "text-gray-500 text-xs"
                      }
                    >
                      ID: {s.id}
                    </div>
                  </div>

                  <div
                    className={
                      active
                        ? "text-white text-left sm:text-right"
                        : "text-left sm:text-right"
                    }
                  >
                    <div
                      className={active ? "text-white font-bold" : "font-bold"}
                    >
                      {st.count}
                    </div>
                    <div
                      className={
                        active
                          ? "text-white/70 text-xs"
                          : "text-gray-500 text-xs"
                      }
                    >
                      prom: {st.avgGapMin ? fmtGapMinutes(st.avgGapMin) : "-"}
                    </div>
                    <div
                      className={
                        active
                          ? "text-white/70 text-xs"
                          : "text-gray-500 text-xs"
                      }
                    >
                      max: {st.maxGapMin ? fmtGapMinutes(st.maxGapMin) : "-"}
                    </div>
                    <div
                      className={
                        active
                          ? "text-white/70 text-xs"
                          : "text-gray-500 text-xs"
                      }
                    >
                      últ: {st.lastAt ? fmtTime(st.lastAt) : "-"}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Detalle cuadrilla */}
        <div className="rounded-2xl border p-4 lg:col-span-2">
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold">
                {selectedSquadName || "Seleccioná una cuadrilla"}
              </h2>
              <p className="text-sm text-gray-500">
                Instalaciones:{" "}
                <span className="font-medium">{selectedList.length}</span>
              </p>
            </div>
          </div>

          {selectedSquadId && selectedList.length === 0 ? (
            <p className="text-sm text-gray-500">
              No hay instalaciones para esta cuadrilla en la fecha elegida.
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedList.map((it, idx) => {
                const next = selectedList[idx + 1]; // anterior en el tiempo
                const t1 = it.createdAt?.toDate?.() as Date | undefined;
                const t0 = next?.createdAt?.toDate?.() as Date | undefined;

                let diffMin = 0;
                let gapText = "";

                if (t1 && t0) {
                  diffMin = Math.max(
                    0,
                    Math.round((t1.getTime() - t0.getTime()) / 60000),
                  );
                  gapText = fmtGapMinutes(diffMin);
                }

                let alertLabel = "";
                let alertClass = "";

                if (diffMin >= 120) {
                  alertLabel = "DEMORA FUERTE";
                  alertClass = "bg-red-50 border-red-200 text-red-700";
                } else if (diffMin >= 60) {
                  alertLabel = "DEMORA";
                  alertClass = "bg-yellow-50 border-yellow-200 text-yellow-800";
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
                      <div className="text-gray-600 mt-1">
                        {it.observaciones}
                      </div>
                    )}

                    {gapText && (
                      <div className="mt-2 text-xs text-gray-700 bg-gray-50 border rounded-lg px-2 py-1 inline-block">
                        Tiempo desde la anterior:{" "}
                        <span className="font-medium">{gapText}</span>
                      </div>
                    )}

                    {alertLabel && (
                      <div
                        className={`mt-2 text-xs border rounded-lg px-2 py-1 inline-block ${alertClass}`}
                      >
                        {alertLabel}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
