import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { AuthUser } from "@/lib/types";

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (username: string, password: string) => Promise<AuthUser>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const AUTH_BOOT_TIMEOUT_MS = 15_000;
/** Max retries during boot before giving up and showing the login screen. */
const MAX_BOOT_RETRIES = 3;
/** Periodic silent auth re-check when tab is visible (catches session expiry). */
const AUTH_RECHECK_MS = 5 * 60_000;

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const bootAttempt = useRef(0);

  const refresh = useCallback(async () => {
    const data = await apiFetch<{ user: AuthUser | null }>("/api/auth/me", { method: "GET" });
    setUser(data.user);
  }, []);

  // Boot: fetch /me with exponential backoff retries
  useEffect(() => {
    let alive = true;

    const runMe = async () => {
      await Promise.race([
        refresh(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("auth_boot_timeout")), AUTH_BOOT_TIMEOUT_MS),
        ),
      ]);
    };

    (async () => {
      for (let attempt = 0; attempt < MAX_BOOT_RETRIES; attempt++) {
        if (!alive) return;
        try {
          await runMe();
          bootAttempt.current = 0;
          if (alive) setIsLoading(false);
          return;
        } catch {
          bootAttempt.current = attempt + 1;
          // Exponential backoff: 500ms, 1.5s, 4s
          const delay = Math.min(500 * Math.pow(3, attempt), 5000);
          await new Promise((r) => setTimeout(r, delay));
        }
      }
      // All retries exhausted — show login screen
      if (alive) {
        setUser(null);
        setIsLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [refresh]);

  // Re-check auth on network recovery — if boot failed, try again
  useEffect(() => {
    const onOnline = () => {
      if (user) return; // already logged in
      void refresh().catch(() => {});
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [user, refresh]);

  // Periodic silent auth re-check (catches session expiry on long-lived tabs)
  useEffect(() => {
    if (!user) return;
    const id = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      void refresh().catch(() => {});
    }, AUTH_RECHECK_MS);
    return () => window.clearInterval(id);
  }, [user, refresh]);

  useEffect(() => {
    function onUnauthorized() {
      setUser(null);
    }
    window.addEventListener("auth:unauthorized", onUnauthorized);
    return () => window.removeEventListener("auth:unauthorized", onUnauthorized);
  }, []);

  const login = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ user: AuthUser }>("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
    return data.user;
  }, []);

  const register = useCallback(async (username: string, password: string) => {
    const data = await apiFetch<{ user: AuthUser }>("/api/auth/register", {
      method: "POST",
      body: JSON.stringify({ username, password }),
    });
    setUser(data.user);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await apiFetch<{ ok: true }>("/api/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({ user, isLoading, refresh, login, register, logout }),
    [user, isLoading, refresh, login, register, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

