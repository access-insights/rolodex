import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

type LocationState = {
  from?: string;
};

export function LoginPage() {
  const { login, user, isLoading, authError } = useAuth();
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const loginInProgress = useRef(false);

  const handleLogin = async () => {
    if (loginInProgress.current || isLoading) return;
    loginInProgress.current = true;
    setIsSigningIn(true);
    setLoginError(null);
    try {
      await login();
    } catch {
      setLoginError("Unable to start Microsoft sign-in. Please try again. If the problem continues, contact your administrator.");
    } finally {
      loginInProgress.current = false;
      setIsSigningIn(false);
    }
  };
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  useEffect(() => {
    if (user) {
      navigate(state?.from || "/contacts", { replace: true });
    }
  }, [navigate, state, user]);

  return (
    <section aria-labelledby="login-title" className="login-page flex min-h-screen items-center justify-center px-4">
      <div className="login-panel w-full max-w-sm text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">Access Insights</p>
        <h1 id="login-title" className="text-4xl font-semibold tracking-tight">
          Rolodex
        </h1>
        <button className="btn mt-8 w-full" disabled={isLoading || isSigningIn} onClick={() => void handleLogin()}>
          {isSigningIn ? "Signing in..." : "Login"}
        </button>
        {(loginError || authError) && <p role="alert" className="mt-4">{loginError || authError}</p>}
      </div>
    </section>
  );
}
