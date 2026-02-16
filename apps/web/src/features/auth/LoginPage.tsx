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
    <section
      aria-labelledby="login-title"
      className="flex min-h-screen items-center justify-center bg-white px-4 text-black"
    >
      <div className="w-full max-w-sm text-center">
        <p className="text-sm uppercase tracking-[0.2em] text-muted">Access Insights</p>
        <h1 id="login-title" className="text-4xl font-semibold tracking-tight">
          Rolodex
        </h1>
        <button className="btn mt-8 w-full" onClick={() => void login()}>
          Login
        </button>
      </div>
    </section>
  );
}
