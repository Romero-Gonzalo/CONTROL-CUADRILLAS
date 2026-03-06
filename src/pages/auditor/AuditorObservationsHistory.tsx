import { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { db } from "../../lib/firebase";

type DayObservation = {
  id: string;
  dayKey?: string;
  text: string;
};

type SquadObservation = {
  id: string;
  dayKey?: string;
  squadId: string;
  text: string;
};

type Squad = {
  id: string;
  name: string;
};

function monthKeyFromDate(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`;
}

function getMonthDayRange(monthInput: string) {
  const [yearStr, monthStr] = monthInput.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr);

  if (!year || !month || month < 1 || month > 12) return null;

  const monthStart = `${yearStr}-${monthStr}-01`;
  const monthEnd = `${yearStr}-${monthStr}-${new Date(year, month, 0)
    .getDate()
    .toString()
    .padStart(2, "0")}`;

  return { monthStart, monthEnd };
}

export default function AuditorObservationsHistory() {
  const [monthInput, setMonthInput] = useState(() => monthKeyFromDate(new Date()));
  const [squads, setSquads] = useState<Squad[]>([]);
  const [dayObservations, setDayObservations] = useState<DayObservation[]>([]);
  const [squadObservations, setSquadObservations] = useState<SquadObservation[]>([]);

  useEffect(() => {
    const unsub = onSnapshot(collection(db, "squads"), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Squad[];
      setSquads(rows);
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    const range = getMonthDayRange(monthInput);
    if (!range) {
      setDayObservations([]);
      return;
    }

    const q = query(
      collection(db, "dailyObservations"),
      where("dayKey", ">=", range.monthStart),
      where("dayKey", "<=", range.monthEnd),
      orderBy("dayKey", "asc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as DayObservation[];
      setDayObservations(rows);
    });

    return () => unsub();
  }, [monthInput]);

  useEffect(() => {
    const range = getMonthDayRange(monthInput);
    if (!range) {
      setSquadObservations([]);
      return;
    }

    const q = query(
      collection(db, "squadDailyObservations"),
      where("dayKey", ">=", range.monthStart),
      where("dayKey", "<=", range.monthEnd),
      orderBy("dayKey", "asc"),
    );

    const unsub = onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as SquadObservation[];
      setSquadObservations(rows);
    });

    return () => unsub();
  }, [monthInput]);

  const daySorted = useMemo(
    () => [...dayObservations].sort((a, b) => (b.dayKey ?? "").localeCompare(a.dayKey ?? "")),
    [dayObservations],
  );

  const squadSorted = useMemo(
    () =>
      [...squadObservations].sort((a, b) => {
        const dayCmp = (b.dayKey ?? "").localeCompare(a.dayKey ?? "");
        if (dayCmp !== 0) return dayCmp;
        return (a.squadId ?? "").localeCompare(b.squadId ?? "");
      }),
    [squadObservations],
  );

  return (
    <div className="px-4 py-4 sm:p-6 max-w-6xl mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold">Historial mensual de observaciones</h1>
          <p className="text-sm text-gray-500">Observaciones generales y por cuadrilla.</p>
        </div>
        <div className="flex gap-2">
          <label className="text-sm">
            <span className="text-gray-600">Mes</span>
            <input
              type="month"
              className="w-full border rounded-xl px-3 py-2 text-sm mt-1"
              value={monthInput}
              onChange={(e) => setMonthInput(e.target.value)}
            />
          </label>
          <Link to="/auditor" className="self-end rounded-xl border px-3 py-2 text-sm">
            Volver
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <div className="rounded-xl border p-3 space-y-2">
          <h2 className="font-medium text-sm">Generales ({daySorted.length})</h2>
          {daySorted.length === 0 ? (
            <p className="text-sm text-gray-500">Sin observaciones generales.</p>
          ) : (
            <ul className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {daySorted.map((obs) => (
                <li key={obs.id} className="rounded-lg border p-2 text-sm">
                  <div className="font-medium">{obs.dayKey ?? obs.id}</div>
                  <div className="text-gray-700 whitespace-pre-wrap">{obs.text || "-"}</div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-xl border p-3 space-y-2">
          <h2 className="font-medium text-sm">Por cuadrilla ({squadSorted.length})</h2>
          {squadSorted.length === 0 ? (
            <p className="text-sm text-gray-500">Sin observaciones por cuadrilla.</p>
          ) : (
            <ul className="space-y-2 max-h-[70vh] overflow-auto pr-1">
              {squadSorted.map((obs) => {
                const squadName = squads.find((s) => s.id === obs.squadId)?.name ?? obs.squadId;
                return (
                  <li key={obs.id} className="rounded-lg border p-2 text-sm">
                    <div className="font-medium">{obs.dayKey ?? "-"} · {squadName}</div>
                    <div className="text-gray-700 whitespace-pre-wrap">{obs.text || "-"}</div>
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