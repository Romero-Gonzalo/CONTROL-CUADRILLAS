import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import type { User as FirebaseUser } from "firebase/auth";import { auth } from "../lib/firebase";
import type { UserProfile } from "../types/auth";
import { getUserProfile } from "../services/userProfile.service";

type AuthState = {
  user: FirebaseUser | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string;
};

const AuthContext = createContext<AuthState>({
  user: null,
  profile: null,
  loading: true,
  error: "",
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      setProfile(null);
      setError("");

      if (!u) {
        setLoading(false);
        return;
      }

      setLoading(true);
      const p = await getUserProfile(u.uid);

      if (!p) {
        setError("No existe perfil en Firestore para este usuario.");
        setProfile(null);
        setLoading(false);
        return;
      }

      setProfile(p);
      setLoading(false);
    });

    return () => unsub();
  }, []);

  const value = useMemo(() => ({ user, profile, loading, error }), [user, profile, loading, error]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}