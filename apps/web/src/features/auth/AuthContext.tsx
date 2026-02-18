import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMsalInstance } from "./msal";
import { setApiAuthToken, setApiAuthTokenProvider } from "../../lib/apiClient";

export type AppRole = "admin" | "creator" | "participant";

type AuthUser = {
  id: string;
  email?: string;
  role: AppRole;
};

type AuthContextValue = {
  user: AuthUser | null;
  isLoading: boolean;
  login: () => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

const FALLBACK_ROLE: AppRole = "participant";

const toAppRole = (claims: unknown): AppRole => {
  const claimObject = claims as { roles?: unknown };
  const roles = Array.isArray(claimObject?.roles) ? claimObject.roles : [];

  if (roles.includes("admin")) return "admin";
  if (roles.includes("creator")) return "creator";
  return FALLBACK_ROLE;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadAccountToken = async (account: { homeAccountId: string } & Record<string, unknown>, forceRefresh = false) => {
      const msalInstance = getMsalInstance();
      if (!msalInstance) return null;

      try {
        const tokenResult = await msalInstance.acquireTokenSilent({
          account: account as Parameters<typeof msalInstance.acquireTokenSilent>[0]["account"],
          scopes: ["openid", "profile", "email"],
          forceRefresh
        });

        return tokenResult.idToken || tokenResult.accessToken || null;
      } catch {
        return null;
      }
    };

    const bootstrap = async () => {
      const msalInstance = getMsalInstance();
      if (!msalInstance) {
        setApiAuthToken(null);
        setApiAuthTokenProvider(null);
        setIsLoading(false);
        return;
      }

      try {
        await msalInstance.initialize();
        const redirectResult = await msalInstance.handleRedirectPromise();
        if (redirectResult?.account) {
          const token = redirectResult.idToken || redirectResult.accessToken || null;
          setApiAuthToken(token);
          setApiAuthTokenProvider(async (forceRefresh?: boolean) =>
            loadAccountToken(
              redirectResult.account as unknown as { homeAccountId: string } & Record<string, unknown>,
              Boolean(forceRefresh)
            )
          );
          setUser({
            id: redirectResult.account.homeAccountId,
            email: redirectResult.account.username,
            role: toAppRole(redirectResult.account.idTokenClaims)
          });
          return;
        }

        const accounts = msalInstance.getAllAccounts();
        const active = accounts[0];
        if (active) {
          const token = await loadAccountToken(active as unknown as { homeAccountId: string } & Record<string, unknown>);
          if (token) {
            setApiAuthToken(token);
            setApiAuthTokenProvider(async (forceRefresh?: boolean) =>
              loadAccountToken(active as unknown as { homeAccountId: string } & Record<string, unknown>, Boolean(forceRefresh))
            );
            setUser({
              id: active.homeAccountId,
              email: active.username,
              role: toAppRole(active.idTokenClaims)
            });
          } else {
            setApiAuthToken(null);
            setApiAuthTokenProvider(null);
            setUser(null);
          }
        } else {
          setApiAuthTokenProvider(null);
        }
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap().catch(() => {
      setApiAuthToken(null);
      setApiAuthTokenProvider(null);
      setIsLoading(false);
    });

    return () => {
      setApiAuthTokenProvider(null);
    };
  }, []);

  const login = async () => {
    const msalInstance = getMsalInstance();
    if (!msalInstance || !import.meta.env.VITE_AZURE_CLIENT_ID) {
      setApiAuthToken(null);
      setApiAuthTokenProvider(null);
      setUser({ id: "dev-user", email: "dev@example.com", role: FALLBACK_ROLE });
      return;
    }

    await msalInstance.loginRedirect({
      scopes: ["openid", "profile", "email"],
      redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || `${window.location.origin}/login`
    });
  };

  const logout = async () => {
    setApiAuthToken(null);
    setApiAuthTokenProvider(null);
    setUser(null);
    const msalInstance = getMsalInstance();
    if (msalInstance && import.meta.env.VITE_AZURE_CLIENT_ID) {
      await msalInstance.logoutPopup();
    }
  };

  const value = useMemo<AuthContextValue>(() => ({ user, isLoading, login, logout }), [user, isLoading]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider");
  }
  return context;
}
