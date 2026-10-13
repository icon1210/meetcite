import { useQueryClient } from "@tanstack/react-query";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { api, setUnauthorizedHandler, tokenStore } from "./api";
import type { TokenResponse, User } from "./types";

interface AuthState {
  user: User | null;
  loading: boolean;
  signIn: (res: TokenResponse) => void;
  signOut: () => void;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(() => tokenStore.get() !== null);

  const signOut = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
    queryClient.clear(); // never show one user's cached meetings to the next
  }, [queryClient]);

  const signIn = useCallback((res: TokenResponse) => {
    tokenStore.set(res.access_token);
    setUser(res.user);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(signOut); // expired token -> back to login
    if (!tokenStore.get()) return;
    api
      .me()
      .then(setUser)
      .catch(() => signOut())
      .finally(() => setLoading(false));
  }, [signOut]);

  const value = useMemo(() => ({ user, loading, signIn, signOut }), [user, loading, signIn, signOut]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
