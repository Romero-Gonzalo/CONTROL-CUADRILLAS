import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getDayKey } from "../utils/dayKey";

export async function createInstallation(params: {
  idInstalacion: string;
  observaciones: string;
  squadId: string;
  userId: string;
}) {
  const { idInstalacion, observaciones, squadId, userId } = params;

  return addDoc(collection(db, "installations"), {
    idInstalacion: idInstalacion.trim(),
    observaciones: observaciones.trim(),
    squadId,
    createdBy: userId,
    scriptSyncStatus: "pending",
    dayKey: getDayKey(),
    createdAt: serverTimestamp(),
  });
}
export async function updateInstallation(params: {
  id: string;
  idInstalacion: string;
  observaciones: string;
}) {
  const { id, idInstalacion, observaciones } = params;

  return updateDoc(doc(db, "installations", id), {
    idInstalacion: idInstalacion.trim(),
    observaciones: observaciones.trim(),
    updatedAt: serverTimestamp(),
  });
}

export async function deleteInstallation(id: string) {
  return deleteDoc(doc(db, "installations", id));
}

type ScriptExecutionResult = {
  sent: boolean;
  message: string;
};

type ScriptHttpResponse = {
  ok?: boolean;
  message?: string;
  duplicated?: boolean;
};

type ScriptPayload = {
  idInstalacion: string;
  squadId: string;
  userId: string;
};

const SCRIPT_SYNC_QUEUE_KEY = "installations-script-sync-queue";

export function queueScriptSync(payload: ScriptPayload) {
  const queue = getQueuedScriptSyncs();
  queue.push(payload);
  localStorage.setItem(SCRIPT_SYNC_QUEUE_KEY, JSON.stringify(queue));
}

export function getQueuedScriptSyncs(): ScriptPayload[] {
  const rawQueue = localStorage.getItem(SCRIPT_SYNC_QUEUE_KEY);
  if (!rawQueue) return [];

  try {
    const parsed = JSON.parse(rawQueue);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item) =>
        typeof item?.idInstalacion === "string" &&
        typeof item?.squadId === "string" &&
        typeof item?.userId === "string",
    );
  } catch {
    return [];
  }
}

export function clearQueuedScriptSyncs() {
  localStorage.removeItem(SCRIPT_SYNC_QUEUE_KEY);
}

export async function updateInstallationScriptSyncStatus(params: {
  id: string;
  status: "pending" | "synced" | "failed";
}) {
  return updateDoc(doc(db, "installations", params.id), {
    scriptSyncStatus: params.status,
    scriptSyncUpdatedAt: serverTimestamp(),
  });
}

function sleep(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function sendIdToAppsScript(params: ScriptPayload): Promise<ScriptExecutionResult> {
  const endpoint = (import.meta.env.VITE_APPS_SCRIPT_WEBAPP_URL as string | undefined)?.trim();
  const apiKey = (import.meta.env.VITE_APPS_SCRIPT_API_KEY as string | undefined)?.trim();
  if (!endpoint) {
    return {
      sent: false,
      message:
        "ID guardado en la app. Falta configurar VITE_APPS_SCRIPT_WEBAPP_URL para enviar a Google Sheets.",
    };
  }

  const payload = JSON.stringify({
    idInstalacion: params.idInstalacion.trim(),
    squadId: params.squadId,
    userId: params.userId,
    source: "control-cuadrillas",
    ...(apiKey ? { apiKey } : {}),
  });

  const requestUrl = apiKey
    ? `${endpoint}${endpoint.includes("?") ? "&" : "?"}apiKey=${encodeURIComponent(apiKey)}`
    : endpoint;

  const maxRetries = 3;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    try {
      const response = await fetch(requestUrl, {
        method: "POST",
        body: payload,
        headers: {
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error(
            "Apps Script respondió 401. Revisá permisos de despliegue del Web App y VITE_APPS_SCRIPT_API_KEY.",
          );
        }
        throw new Error(`Apps Script respondió ${response.status}`);
      }

      const contentType = response.headers.get("content-type") || "";
      if (contentType.includes("application/json")) {
        const body = (await response.json()) as ScriptHttpResponse;
        if (body.ok === false) {
          throw new Error(body.message || "Apps Script respondió error lógico");
        }

        if (body.duplicated) {
          return {
            sent: true,
            message: body.message || "ID ya existente en Google Sheets.",
          };
        }
      }

      return {
        sent: true,
        message: "ID enviado al script de Google Sheets.",
      };
    } catch (error) {
      lastError = error as Error;
      if (attempt < maxRetries - 1) {
        await sleep(500 * (attempt + 1));
      }
    }
  }

  throw lastError ?? new Error("No se pudo sincronizar con Apps Script");
}
