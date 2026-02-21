import { doc, getDoc } from "firebase/firestore";
import { db } from "../lib/firebase";
import type { UserProfile } from "../types/auth";

export async function getUserProfile(uid: string): Promise<UserProfile | null> {
  const ref = doc(db, "users", uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;

  const data = snap.data() as Omit<UserProfile, "uid">;
  return { uid, ...data };
}