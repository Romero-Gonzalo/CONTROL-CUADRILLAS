import { useEffect, useMemo, useRef, useState } from "react";
import { signOut } from "firebase/auth";
import { auth, db } from "../../lib/firebase";
import { useAuth } from "../../app/AuthProvider";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { getDayKey } from "../../utils/dayKey";

type Squad = {
  id: string;
  name: string;
  active: boolean;
};

type InstallationItem = {
  id: string;
  idInstalacion: string;
  observaciones: string;
  squadId: string;
  createdAt?: any;
};

type AlertLevel = "all" | "normal" | "delay" | "critical";

function getAlertLevel(diffMin: number): Exclude<AlertLevel, "all"> {
  if (diffMin >= 120) return "critical";
  if (diffMin >= 60) return "delay";
  return "normal";
}

function normalizeInstallationId(value: string) {
  return value.toLowerCase().replace(/[\s_-]/g, "");
}

function escCsv(value: any) {
  const s = String(value ?? "");
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

export default function AuditorHome() {
  const { profile } = useAuth();

  const [squads, setSquads] = useState<Squad[]>([]);
  const [installations, setInstallations] = useState<InstallationItem[]>([]);
  const [selectedSquadId, setSelectedSquadId] = useState<string | null>(null);

  const [dayInput, setDayInput] = useState(() => getDayKey());
  const [searchId, setSearchId] = useState("");
  const [alertFilter, setAlertFilter] = useState<AlertLevel>("all");

  const [pendingScrollInstallationId, setPendingScrollInstallationId] =
    useState<string | null>(null);
  const [highlightedInstallationId, setHighlightedInstallationId] = useState<
    string | null
  >(null);

  const installationRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const dayKey = useMemo(() => dayInput, [dayInput]);

  const normalizedSearch = useMemo(
    () => normalizeInstallationId(searchId.trim()),
    [searchId],
  );

  const matchedInstallations = useMemo(() => {
    if (!normalizedSearch) return [];

    return installations.filter((it) =>
      normalizeInstallationId(it.idInstalacion ?? "").includes(normalizedSearch),
    );
  }, [installations, normalizedSearch]);

  const searchResult = useMemo(() => {
    if (!normalizedSearch) return null;

    const exact = matchedInstallations.find(
      (it) => normalizeInstallationId(it.idInstalacion ?? "") === normalizedSearch,
    );

    return exact ?? matchedInstallations[0] ?? null;
  }, [matchedInstallations, normalizedSearch]);

  const searchSuggestions = useMemo(
    () => matchedInstallations.slice(0, 5),
    [matchedInstallations],
  );

  useEffect(() => {
    const q = query(collection(db, "squads"), where("active", "==", true));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const rows = snap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as any),
        })) as Squad[];

        rows.sort((a, b) => a.id.localeCompare(b.id));
        setSquads(rows);

        if (!selectedSquadId && rows.length > 0) setSelectedSquadId(rows[0].id);
      },
      (err) => console.error(err),
    );

    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const squadStats = useMemo(() => {
    const groups: Record<string, InstallationItem[]> = {};
    for (const it of installations) (groups[it.squadId] ??= []).push(it);

    for (const sid of Object.keys(groups)) {
      groups[sid].sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime?.() ?? 0;
        const tb = b.createdAt?.toDate?.()?.getTime?.() ?? 0;
        return tb - ta;
      });
    }

    const stats: Record<
      string,
      { count: number; lastAt: any | null; avgGapMin: number; maxGapMin: number }
    > = {};

    for (const sid of Object.keys(groups)) {
      const list = groups[sid];
      const gaps = calcGapsDesc(list);
      stats[sid] = {
        count: list.length,
        lastAt: list[0]?.createdAt ?? null,
        avgGapMin: avg(gaps),
        maxGapMin: max(gaps),
      };
    }

    return stats;
  }, [installations]);

  const selectedList = useMemo(() => {
    if (!selectedSquadId) return [];
    return installations.filter((x) => x.squadId === selectedSquadId);
  }, [installations, selectedSquadId]);

  const selectedSquadName = useMemo(() => {
    const s = squads.find((x) => x.id === selectedSquadId);
    return s?.name ?? selectedSquadId ?? "";
  }, [squads, selectedSquadId]);

  const selectedItemsWithGap = useMemo(
    () =>
      selectedList.map((it, idx) => {
        const next = selectedList[idx + 1];
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

        return { it, diffMin, gapText, level: getAlertLevel(diffMin) };
      }),
    [selectedList],
  );

  const filteredSelectedItems = useMemo(() => {
    if (alertFilter === "all") return selectedItemsWithGap;
    return selectedItemsWithGap.filter((row) => row.level === alertFilter);
  }, [alertFilter, selectedItemsWithGap]);

  useEffect(() => {
    if (!pendingScrollInstallationId) return;

    const target = installationRefs.current[pendingScrollInstallationId];
    if (!target) return;

    target.scrollIntoView({ behavior: "smooth", block: "center" });
    setHighlightedInstallationId(pendingScrollInstallationId);
    setPendingScrollInstallationId(null);
  }, [pendingScrollInstallationId, selectedList]);

  useEffect(() => {
    if (!highlightedInstallationId) return;

    const timeoutId = window.setTimeout(() => {
      setHighlightedInstallationId(null);
    }, 1800);

    return () => window.clearTimeout(timeoutId);
  }, [highlightedInstallationId]);

  const goToInstallationSquad = (item: InstallationItem) => {
    setSelectedSquadId(item.squadId);
    setPendingScrollInstallationId(item.id);
  };

  const filterButtons: Array<{ id: AlertLevel; label: string }> = [
    { id: "all", label: "Todas" },
    { id: "normal", label: "Sin demora" },
    { id: "delay", label: "Demora" },
    { id: "critical", label: "Demora fuerte" },
  ];

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
    const lines: string[] = [header.join(";")];

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

      lines.push(
        [
          escCsv(dayKey),
          escCsv(squadId),
          escCsv(squadName),
          escCsv(timeStr),
          escCsv(it.idInstalacion),
          escCsv(it.observaciones),
          escCsv(gapMin),
        ].join(";"),
      );
    }

    downloadTextFile(`IPT_instalaciones_${dayKey}.csv`, lines.join("\n"));
  };

  return (
    <div className="px-4 py-4 pb-24 sm:pb-6 sm:p-6 space-y-4 sm:space-y-6 max-w-6xl mx-auto">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-stretch">
        <div className="rounded-2xl border p-3 sm:p-4 lg:col-span-2">
          <div className="text-sm font-medium mb-2">Buscar instalación</div>

          <input
            type="text"
            placeholder="Ej: IPT-12345"
            value={searchId}
            onChange={(e) => setSearchId(e.target.value)}
            className="w-full border rounded-xl px-3 py-2 text-sm"
          />

          {searchId && (
            <div className="mt-3 space-y-2">
              {searchResult ? (
                <div className="border rounded-xl p-3 bg-green-50">
                  <div className="font-medium text-sm sm:text-base">
                    Instalación {searchResult.idInstalacion}
                  </div>
                  <div className="text-sm text-gray-700">
                    Cuadrilla: {squads.find((s) => s.id === searchResult.squadId)?.name ?? searchResult.squadId}
                  </div>
                  <div className="text-sm text-gray-700">Hora: {fmtTime(searchResult.createdAt)}</div>

                  <button
                    type="button"
                    onClick={() => goToInstallationSquad(searchResult)}
                    className="mt-2 px-3 py-1.5 rounded-lg border bg-white text-sm font-medium"
                  >
                    Ir a cuadrilla
                  </button>

                  {searchResult.observaciones && (
                    <div className="text-sm text-gray-600 mt-1">Obs: {searchResult.observaciones}</div>
                  )}
                </div>
              ) : (
                <div className="text-sm text-gray-500">No se encontraron instalaciones para ese texto.</div>
              )}

              {searchSuggestions.length > 1 && (
                <div className="rounded-xl border p-2">
                  <div className="text-xs text-gray-500 mb-2">Sugerencias</div>
                  <div className="space-y-1">
                    {searchSuggestions.map((it) => (
                      <button
                        key={it.id}
                        type="button"
                        onClick={() => goToInstallationSquad(it)}
                        className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-gray-50 text-sm flex items-center justify-between"
                      >
                        <span className="font-medium">{it.idInstalacion}</span>
                        <span className="text-xs text-gray-500">{fmtTime(it.createdAt)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="rounded-2xl border p-3 sm:p-4 flex flex-col gap-3">
          <h1 className="text-lg sm:text-2xl font-bold leading-tight">{profile?.displayName ?? "Auditor"}</h1>
          <p className="text-sm text-gray-500">Panel diario por cuadrilla</p>

          <input
            type="date"
            className="w-full border rounded-xl px-3 py-2 text-sm"
            value={dayInput}
            onChange={(e) => setDayInput(e.target.value)}
          />

          <button
            type="button"
            className="hidden sm:block px-3 py-2 rounded-xl border text-sm"
            onClick={exportCsv}
            title="Exporta todas las instalaciones del día a CSV"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      <div className="overflow-x-auto -mx-1 px-1">
        <div className="flex gap-2 min-w-max">
          {filterButtons.map((fb) => {
            const active = fb.id === alertFilter;
            return (
              <button
                key={fb.id}
                type="button"
                onClick={() => setAlertFilter(fb.id)}
                className={[
                  "px-3 py-1.5 rounded-full text-xs sm:text-sm border whitespace-nowrap",
                  active ? "bg-black text-white border-black" : "bg-white",
                ].join(" ")}
              >
                {fb.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="hidden sm:grid grid-cols-3 gap-2">
        <button
          type="button"
          className="px-3 py-2 rounded-xl border text-sm"
          onClick={() => setAlertFilter("all")}
        >
          Limpiar filtro
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border text-sm"
          onClick={() => setSearchId("")}
        >
          Limpiar búsqueda
        </button>
        <button
          type="button"
          className="px-3 py-2 rounded-xl border text-sm"
          onClick={() => signOut(auth)}
        >
          Salir
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
        <div className="rounded-2xl border p-3 sm:p-4">
          <div className="text-sm text-gray-500">Fecha</div>
          <div className="text-lg sm:text-xl font-bold">{dayKey}</div>
        </div>
        <div className="rounded-2xl border p-3 sm:p-4">
          <div className="text-sm text-gray-500">Total instalaciones</div>
          <div className="text-lg sm:text-xl font-bold">{installations.length}</div>
        </div>
        <div className="rounded-2xl border p-3 sm:p-4">
          <div className="text-sm text-gray-500">Cuadrillas activas</div>
          <div className="text-lg sm:text-xl font-bold">{squads.length}</div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        <div className="rounded-2xl border p-3 sm:p-4">
          <h2 className="font-semibold mb-2 sm:mb-3">Cuadrillas</h2>

          <div className="space-y-1.5 sm:space-y-2">
            {squads.map((s) => {
              const st = squadStats[s.id] ?? { count: 0, lastAt: null, avgGapMin: 0, maxGapMin: 0 };
              const active = selectedSquadId === s.id;

              return (
                <button
                  key={s.id}
                  onClick={() => setSelectedSquadId(s.id)}
                  className={[
                    "w-full text-left border rounded-xl p-2.5 sm:p-3 flex items-start sm:items-center justify-between gap-2",
                    active ? "bg-black text-white border-black" : "bg-white",
                  ].join(" ")}
                >
                  <div>
                    <div className="font-medium text-sm sm:text-base">{s.name}</div>
                    <div className={active ? "text-white/70 text-xs" : "text-gray-500 text-xs"}>ID: {s.id}</div>
                  </div>

                  <div className={active ? "text-white text-right" : "text-right"}>
                    <div className="font-bold text-sm">{st.count}</div>
                    <div className={active ? "text-white/70 text-xs" : "text-gray-500 text-xs"}>prom: {st.avgGapMin ? fmtGapMinutes(st.avgGapMin) : "-"}</div>
                    <div className={active ? "text-white/70 text-xs" : "text-gray-500 text-xs"}>max: {st.maxGapMin ? fmtGapMinutes(st.maxGapMin) : "-"}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border p-3 sm:p-4 lg:col-span-2">
          <div className="flex items-end justify-between gap-3 mb-3">
            <div>
              <h2 className="font-semibold text-sm sm:text-base">{selectedSquadName || "Seleccioná una cuadrilla"}</h2>
              <p className="text-xs sm:text-sm text-gray-500">
                Instalaciones: <span className="font-medium">{filteredSelectedItems.length}</span>
              </p>
            </div>
          </div>

          {selectedSquadId && filteredSelectedItems.length === 0 ? (
            <p className="text-sm text-gray-500">No hay instalaciones para esta cuadrilla con el filtro elegido.</p>
          ) : (
            <ul className="space-y-1.5 sm:space-y-2">
              {filteredSelectedItems.map(({ it, diffMin, gapText }) => {
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
                  <li
                    key={it.id}
                    ref={(node) => {
                      installationRefs.current[it.id] = node;
                    }}
                    className={[
                      "text-sm border rounded-xl p-2.5 sm:p-3 transition-colors",
                      highlightedInstallationId === it.id ? "bg-blue-50 border-blue-300" : "",
                    ].join(" ")}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium text-sm">{it.idInstalacion}</div>
                      <div className="text-xs text-gray-500">{fmtTime(it.createdAt)}</div>
                    </div>

                    {it.observaciones && <div className="text-gray-600 mt-1 text-xs sm:text-sm">{it.observaciones}</div>}

                    {gapText && (
                      <div className="mt-2 text-xs text-gray-700 bg-gray-50 border rounded-lg px-2 py-1 inline-block">
                        Tiempo desde la anterior: <span className="font-medium">{gapText}</span>
                      </div>
                    )}

                    {alertLabel && (
                      <div className={`mt-2 text-xs border rounded-lg px-2 py-1 inline-block ${alertClass}`}>
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

      <div className="fixed bottom-0 left-0 right-0 sm:hidden border-t bg-white/95 backdrop-blur px-3 py-2">
        <div className="grid grid-cols-4 gap-2">
          <button type="button" className="rounded-lg border px-2 py-2 text-xs" onClick={exportCsv}>CSV</button>
          <button type="button" className="rounded-lg border px-2 py-2 text-xs" onClick={() => setAlertFilter("all")}>Filtro</button>
          <button type="button" className="rounded-lg border px-2 py-2 text-xs" onClick={() => setSearchId("")}>Buscar</button>
          <button type="button" className="rounded-lg border px-2 py-2 text-xs" onClick={() => signOut(auth)}>Salir</button>
        </div>
      </div>
    </div>
  );
}
