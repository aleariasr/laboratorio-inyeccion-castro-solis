"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
} from "react";

import {
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from "./api";
import {
  clearStoredSession,
  readStoredSession,
  writeStoredSession,
} from "./storage";
import type {
  AuthUser,
  LoginCredentials,
  StoredSession,
} from "./types";

type AuthStatus =
  | "loading"
  | "authenticated"
  | "unauthenticated";

type AuthContextValue = {
  status: AuthStatus;
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
  login: (credentials: LoginCredentials) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const [status, setStatus] = useState<AuthStatus>("loading");
  const [session, setSession] = useState<StoredSession | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function initializeSession(): Promise<void> {
      const storedSession = readStoredSession();

      if (!storedSession) {
        await Promise.resolve();

        if (!isCancelled) {
          setStatus("unauthenticated");
        }

        return;
      }

      try {
        const user = await getCurrentUser(storedSession.token);

        if (isCancelled) {
          return;
        }

        const restoredSession: StoredSession = {
          token: storedSession.token,
          user,
        };

        writeStoredSession(restoredSession);
        setSession(restoredSession);
        setStatus("authenticated");
      } catch {
        if (isCancelled) {
          return;
        }

        clearStoredSession();
        setSession(null);
        setStatus("unauthenticated");
      }
    }

    void initializeSession();

    return () => {
      isCancelled = true;
    };
  }, []);

  async function login(
    credentials: LoginCredentials,
  ): Promise<void> {
    const response = await loginRequest(credentials);

    const authenticatedSession: StoredSession = {
      token: response.token,
      user: response.user,
    };

    writeStoredSession(authenticatedSession);
    setSession(authenticatedSession);
    setStatus("authenticated");
  }

  async function logout(): Promise<void> {
    const currentToken = session?.token ?? null;

    clearStoredSession();
    setSession(null);
    setStatus("unauthenticated");

    if (!currentToken) {
      return;
    }

    try {
      await logoutRequest(currentToken);
    } catch {
      /*
       * La sesión local ya fue eliminada.
       * Un fallo de red no debe mantener al usuario autenticado
       * en esta computadora.
       */
    }
  }

  async function refreshUser(): Promise<void> {
    const currentToken = session?.token;

    if (!currentToken) {
      clearStoredSession();
      setSession(null);
      setStatus("unauthenticated");
      return;
    }

    try {
      const user = await getCurrentUser(currentToken);

      const refreshedSession: StoredSession = {
        token: currentToken,
        user,
      };

      writeStoredSession(refreshedSession);
      setSession(refreshedSession);
      setStatus("authenticated");
    } catch {
      clearStoredSession();
      setSession(null);
      setStatus("unauthenticated");
    }
  }

  const value: AuthContextValue = {
    status,
    user: session?.user ?? null,
    token: session?.token ?? null,
    isAuthenticated: status === "authenticated",
    login,
    logout,
    refreshUser,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error(
      "useAuth debe utilizarse dentro de AuthProvider.",
    );
  }

  return context;
}