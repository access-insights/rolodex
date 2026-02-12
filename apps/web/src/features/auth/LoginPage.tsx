import { useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "./AuthContext";

type LocationState = {
  from?: string;
};

export function LoginPage() {
  const { login, user } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;

  useEffect(() => {
    if (user) {
      navigate(state?.from || "/contacts", { replace: true });
    }
  }, [navigate, state, user]);

  return (
    <section aria-labelledby="login-title" className="max-w-xl rounded border border-border bg-surface p-6">
      <h1 id="login-title" className="text-2xl font-semibold">
        Sign in
      </h1>
      <p className="mt-2 text-muted">
        Use your Microsoft account to continue. In local mode without Azure settings, a development user is used.
      </p>
      <button className="btn mt-4" onClick={() => void login()}>
        Continue with Microsoft
      </button>
    </section>
  );
}
