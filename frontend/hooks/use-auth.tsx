// =============================================================================
// TripCompass — useAuth hook + AuthProvider
// Source of truth: docs/integration/06-FRONTEND-INFRA.md §2
//                  docs/integration/02-AUTH-FLOW.md
//
// Auth is cookie-based: the backend sets an HttpOnly cookie on login/register
// /google/facebook, so JavaScript never holds the token. apiFetch sends the
// cookie via `credentials: "include"`. Logout calls the backend to clear it.
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
  loading: boolean;
  /** Email+password login */
  login: (email: string, password: string) => Promise<void>;
  /** Google OAuth login — pass id_token from Google Identity SDK */
  loginGoogle: (idToken: string) => Promise<void>;
  /** Facebook OAuth login — pass access_token from FB SDK */
  loginFacebook: (accessToken: string) => Promise<void>;
  /** Clear cookie on server + reset state + redirect home */
  logout: () => Promise<void>;
  /** Re-fetch /auth/me using the session cookie */
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
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      // Bootstrap probe: 401 here just means "anonymous viewer" — do NOT
      // bounce them out of public pages (explore, /itinerary/:id/public).
      const { user: u } = await apiFetch<{ user: User }>("/auth/me", {
        silent401: true,
      });
      setUser(u);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  // Auth endpoints set the HttpOnly cookie server-side; we just need to
  // refresh local state from /auth/me so the UI reflects the new session.
  const login = async (email: string, password: string) => {
    const { user: u } = await apiFetch<{ user: User }>("/auth/login", {
      method: "POST",
      body: { email, password },
      auth: false,
    });
    setUser(u);
  };

  const loginGoogle = async (idToken: string) => {
    const { user: u } = await apiFetch<{ user: User }>("/auth/google", {
      method: "POST",
      body: { id_token: idToken },
      auth: false,
    });
    setUser(u);
  };

  const loginFacebook = async (accessToken: string) => {
    const { user: u } = await apiFetch<{ user: User }>("/auth/facebook", {
      method: "POST",
      body: { access_token: accessToken },
      auth: false,
    });
    setUser(u);
  };

  const logout = async () => {
    try {
      await apiFetch("/auth/logout", { method: "POST", auth: false });
    } catch {
      // Even if the network call fails, drop local state — the user clicked
      // logout. Cookie expires on its own; worst case is one stale tab.
    }
    setUser(null);
    if (typeof window !== "undefined") window.location.href = "/";
  };

  return (
    <AuthContext.Provider
      value={{ user, loading, login, loginGoogle, loginFacebook, logout, refresh }}
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
