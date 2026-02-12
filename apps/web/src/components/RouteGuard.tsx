import { Navigate, useLocation } from "react-router-dom";
import { useAuth, type AppRole } from "../features/auth/AuthContext";

type RouteGuardProps = {
  allowRoles: AppRole[];
  children: React.ReactNode;
};

export function RouteGuard({ allowRoles, children }: RouteGuardProps) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) {
    return <p aria-live="polite">Loading user session...</p>;
  }

  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  if (!allowRoles.includes(user.role)) {
    return (
      <section aria-labelledby="forbidden-title">
        <h1 id="forbidden-title" className="text-xl font-semibold">
          Access denied
        </h1>
        <p className="mt-2 text-muted">Your role does not allow this page.</p>
      </section>
    );
  }

  return <>{children}</>;
}
