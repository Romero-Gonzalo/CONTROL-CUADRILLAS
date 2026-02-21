import { addDoc, collection, serverTimestamp } from "firebase/firestore";
import { db } from "../lib/firebase";
import { getDayKey } from "../utils/dayKey";

export async function createInstallation(params: {
  idInstalacion: string;
  observaciones: string;
  squadId: string;   // viene del perfil del usuario
  userId: string;    // uid
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