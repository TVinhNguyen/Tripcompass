// =============================================================================
// TripCompass — useAuth hook + AuthProvider
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §2
//                  docs/integration/02-AUTH-FLOW.md
// =============================================================================

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { apiFetch, ApiError } from "@/lib/api";
import type { User } from "@/lib/types";

// ---------------------------------------------------------------------------
// Context type
// ---------------------------------------------------------------------------

type AuthCtx = {
  user: User | null;
  token: string | null;
  loading: boolean;
  /** Email+password login */
  login: (email: string, password: string) => Promise<void>;
  /** Google OAuth login — pass id_token from Google Identity SDK */
  loginGoogle: (idToken: string) => Promise<void>;
  /** Facebook OAuth login — pass access_token from FB SDK */
  loginFacebook: (accessToken: string) => Promise<void>;
  /** Clear token + state + redirect home */
  logout: () => void;
  /** Re-fetch /auth/me with current token */
  refresh: () => Promise<void>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const AuthContext = createContext<AuthCtx | null>(null);

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser]       = useState<User | null>(null);
  const [token, setToken]     = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // ---- bootstrap ----
  const refresh = useCallback(async () => {
    const t =
      typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!t) {
      setUser(null);
      setToken(null);
      return;
    }
    try {
      const { user: u } = await apiFetch<{ user: User }>("/auth/me");
      setUser(u);
      setToken(t);
    } catch {
      localStorage.removeItem("token");
      setUser(null);
      setToken(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // ---- helpers ----
  const persist = (t: string, u: User) => {
    localStorage.setItem("token", t);
    setToken(t);
    setUser(u);
  };

  const login = async (email: string, password: string) => {
    const { token: t, user: u } = await apiFetch<{ token: string; user: User }>(
      "/auth/login",
      { method: "POST", body: { email, password }, auth: false },
    );
    persist(t, u);
  };

  const loginGoogle = async (idToken: string) => {
    const { token: t, user: u } = await apiFetch<{ token: string; user: User }>(
      "/auth/google",
      { method: "POST", body: { id_token: idToken }, auth: false },
    );
    persist(t, u);
  };

  const loginFacebook = async (accessToken: string) => {
    const { token: t, user: u } = await apiFetch<{ token: string; user: User }>(
      "/auth/facebook",
      { method: "POST", body: { access_token: accessToken }, auth: false },
    );
    persist(t, u);
  };

  const logout = () => {
    localStorage.removeItem("token");
    setUser(null);
    setToken(null);
    if (typeof window !== "undefined") window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{ user, token, loading, login, loginGoogle, loginFacebook, logout, refresh }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useAuth(): AuthCtx {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth() must be used inside <AuthProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Error helper (re-exported for convenience)
// ---------------------------------------------------------------------------

export { ApiError };
