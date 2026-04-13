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

export async function sendIdToAppsScript(params: {
  idInstalacion: string;
  squadId: string;
  userId: string;
}): Promise<ScriptExecutionResult> {
  const endpoint = (import.meta.env.VITE_APPS_SCRIPT_WEBAPP_URL as string | undefined)?.trim();
  if (!endpoint) {
    return {
      sent: false,
      message:
        "ID guardado en la app. Falta configurar VITE_APPS_SCRIPT_WEBAPP_URL para enviar a Google Sheets.",
    };
  }

  const payload = new URLSearchParams({
    idInstalacion: params.idInstalacion.trim(),
    squadId: params.squadId,
    userId: params.userId,
    source: "control-cuadrillas",
  });

  const response = await fetch(endpoint, {
    method: "POST",
    body: payload,
    mode: "no-cors",
  });

  if (response.type !== "opaque" && !response.ok) {
    throw new Error(`Apps Script respondió ${response.status}`);
  }

  return {
    sent: true,
    message: "ID enviado al script de Google Sheets.",
  };
}
