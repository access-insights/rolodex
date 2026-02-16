import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/contacts", label: "Contacts" },
  { to: "/contacts/new", label: "New Contact" },
  { to: "/admin/users", label: "Admin" }
];

const toDisplayName = (emailOrId: string) => {
  const source = emailOrId.includes("@") ? emailOrId.split("@")[0] : emailOrId;
  const cleaned = source.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "User";
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();

  if (!user) {
    return <main id="main-content">{children}</main>;
  }

  const userLabel = toDisplayName(user.email ?? user.id);

  return (
    <div className="min-h-screen bg-canvas text-text">
      <a
        href="#main-content"
        className="skip-link absolute left-3 top-3 rounded bg-surface px-3 py-2 text-sm text-text"
      >
        Skip to content
      </a>

      <header className="app-shell-header">
        <div className="app-shell-top-row">
          <div className="app-shell-brand">
            <span className="app-shell-brand-icon" aria-hidden="true">
              R
            </span>
            <p className="app-shell-brand-text">Rolodex</p>
          </div>
          <div className="app-shell-account-row">
            <span className="app-shell-user">{userLabel}</span>
            <button className="btn app-shell-signout" onClick={logout}>
              Sign Out <span aria-hidden="true">v</span>
            </button>
          </div>
        </div>
        <nav aria-label="Primary" className="app-shell-nav-wrap">
          <ul className="app-shell-nav-list">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink className={({ isActive }) => `app-shell-tab ${isActive ? "app-shell-tab-active" : ""}`} to={item.to}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-7" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
