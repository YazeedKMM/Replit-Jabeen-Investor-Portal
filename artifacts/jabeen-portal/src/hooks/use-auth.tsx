import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetMe,
  getGetMeQueryKey,
  useLogin,
  useLogout,
  useRegister,
  setAuthTokenGetter,
  type User,
  type LoginInput,
  type RegisterInput,
  type AuthResult,
  type LoginResult,
} from "@workspace/api-client-react";

const TOKEN_KEY = "jabeen_access_token";

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  /** Returns LoginResult — may include mfaRequired/mfaSetupRequired instead of accessToken */
  login: (data: LoginInput) => Promise<LoginResult>;
  register: (data: RegisterInput) => Promise<AuthResult>;
  logout: () => Promise<void>;
  isAuthenticated: boolean;
  /** Called after MFA step resolves — sets token + user in context */
  handleAuthResult: (result: AuthResult) => void;
  /** Re-login to pick up a fresh access token after activation. Clears the local token so the user is redirected to login. */
  checkActivationStatus: () => void;
}

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem(TOKEN_KEY));
  const [isInitializing, setIsInitializing] = useState(true);
  const initRef = useRef(false);
  const queryClient = useQueryClient();

  // Wire up bearer token getter once
  useEffect(() => {
    setAuthTokenGetter(() => localStorage.getItem(TOKEN_KEY));
  }, []);

  const { data: user, isLoading: isUserLoading } = useGetMe({
    query: {
      enabled: !!token,
      retry: false,
      queryKey: getGetMeQueryKey(),
    },
  });

  const loginMutation = useLogin();
  const registerMutation = useRegister();
  const logoutMutation = useLogout();

  // Silent refresh on mount — runs exactly once
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    async function initAuth() {
      const storedToken = localStorage.getItem(TOKEN_KEY);
      if (!storedToken) {
        // Try silent cookie-based refresh
        try {
          const resp = await fetch("/api/auth/refresh", { method: "POST", credentials: "include" });
          if (resp.ok) {
            const result = await resp.json() as AuthResult;
            setToken(result.accessToken);
            localStorage.setItem(TOKEN_KEY, result.accessToken);
          }
        } catch {
          // No session — stay logged out
        }
      }
      setIsInitializing(false);
    }

    initAuth();
  }, []); // empty deps — intentionally runs once

  const handleAuthResult = useCallback(
    (result: AuthResult) => {
      setToken(result.accessToken);
      localStorage.setItem(TOKEN_KEY, result.accessToken);
      queryClient.setQueryData(["/api/auth/me"], result.user);
    },
    [queryClient],
  );

  const login = useCallback(
    async (data: LoginInput): Promise<LoginResult> => {
      const result = await loginMutation.mutateAsync({ data });
      // Only set token if we got a full session (no MFA step pending)
      if (result.accessToken && result.user) {
        handleAuthResult({ accessToken: result.accessToken, user: result.user });
      }
      return result;
    },
    [loginMutation, handleAuthResult],
  );

  const register = useCallback(
    async (data: RegisterInput) => {
      const result = await registerMutation.mutateAsync({ data });
      handleAuthResult(result);
      return result;
    },
    [registerMutation, handleAuthResult],
  );

  const performLogout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      setToken(null);
      localStorage.removeItem(TOKEN_KEY);
      queryClient.clear();
    }
  }, [logoutMutation, queryClient]);

  const checkActivationStatus = useCallback(() => {
    setToken(null);
    localStorage.removeItem(TOKEN_KEY);
    queryClient.clear();
  }, [queryClient]);

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading: isInitializing || (!!token && isUserLoading),
        login,
        register,
        logout: performLogout,
        isAuthenticated: !!user,
        handleAuthResult,
        checkActivationStatus,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
