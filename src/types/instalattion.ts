import type { Timestamp } from "firebase/firestore";

export type Installation = {
  id: string; // doc id
  idInstalacion: string;
  squadId: string;
  observaciones: string;
  createdAt: Timestamp;
  createdBy: string; // uid
  dayKey: string; // "YYYY-MM-DD"
  gapFromPrevMin?: number; // opcional para futuro (functions)
};