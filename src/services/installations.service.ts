import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "../lib/firebase";
import { getDayKey } from "../utils/dayKey";
import type {
  InstallationReason,
  InstallationStatus,
  WorkflowStatus,
} from "../types/installationStatus";

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
    workflowStatus: "PENDIENTE",
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

export async function createPreloadedInstallations(params: {
  squadId: string;
  userId: string;
  ids: string[];
  dayKey: string;
}) {
  const { squadId, userId, ids, dayKey } = params;
  const cleanIds = ids
    .map((value) => value.trim())
    .filter(Boolean);

  if (cleanIds.length === 0) return { created: 0 };

  const batch = writeBatch(db);
  const installationsRef = collection(db, "installations");

  cleanIds.forEach((idInstalacion) => {
    const ref = doc(installationsRef);
    batch.set(ref, {
      idInstalacion,
      observaciones: "",
      squadId,
      createdBy: userId,
      dayKey,
      source: "AUDITOR_PRELOAD",
      workflowStatus: "PENDIENTE",
      createdAt: serverTimestamp(),
      preloadedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return { created: cleanIds.length };
}

export async function updateInstallationWorkflow(params: {
  id: string;
  workflowStatus: WorkflowStatus;
  resolutionComment?: string;
  resolvedBy: string;
}) {
  const { id, workflowStatus, resolutionComment, resolvedBy } = params;

  return updateDoc(doc(db, "installations", id), {
    workflowStatus,
    resolutionComment: (resolutionComment ?? "").trim(),
    resolvedBy,
    resolvedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export async function auditInstallation(params: {
  id: string;
  auditorStatus: InstallationStatus;
  auditorReason?: InstallationReason | "";
  auditorComment?: string;
}) {
  const { id, auditorStatus, auditorReason = "", auditorComment = "" } = params;

  return updateDoc(doc(db, "installations", id), {
    audited: true,
    auditorStatus,
    auditorReason,
    auditorComment: auditorComment.trim(),
    auditedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}
