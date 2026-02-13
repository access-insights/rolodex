import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { getMsalInstance } from "./msal";

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

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const bootstrap = async () => {
      const msalInstance = getMsalInstance();
      if (!msalInstance) {
        setIsLoading(false);
        return;
      }

      try {
        await msalInstance.initialize();
        const redirectResult = await msalInstance.handleRedirectPromise();
        if (redirectResult?.account) {
          setUser({
            id: redirectResult.account.homeAccountId,
            email: redirectResult.account.username,
            role: FALLBACK_ROLE
          });
          return;
        }

        const accounts = msalInstance.getAllAccounts();
        const active = accounts[0];
        if (active) {
          setUser({ id: active.homeAccountId, email: active.username, role: FALLBACK_ROLE });
        }
      } finally {
        setIsLoading(false);
      }
    };

    bootstrap().catch(() => {
      setIsLoading(false);
    });
  }, []);

  const login = async () => {
    const msalInstance = getMsalInstance();
    if (!msalInstance || !import.meta.env.VITE_AZURE_CLIENT_ID) {
      setUser({ id: "dev-user", email: "dev@example.com", role: FALLBACK_ROLE });
      return;
    }

    await msalInstance.loginRedirect({
      scopes: ["openid", "profile", "email"],
      redirectUri: import.meta.env.VITE_AZURE_REDIRECT_URI || `${window.location.origin}/login`
    });
  };

  const logout = async () => {
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
