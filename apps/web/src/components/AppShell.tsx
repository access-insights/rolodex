import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "../features/auth/AuthContext";

type AppShellProps = {
  children: ReactNode;
};

const navItems = [
  { to: "/contacts", label: "Contacts" },
  { to: "/contacts/new", label: "New Contact" },
  { to: "/admin/users", label: "Admin Users" }
];

export function AppShell({ children }: AppShellProps) {
  const { user, logout } = useAuth();

  if (!user) {
    return <main id="main-content">{children}</main>;
  }

  return (
    <div className="min-h-screen bg-canvas text-text">
      <a
        href="#main-content"
        className="skip-link absolute left-3 top-3 rounded bg-surface px-3 py-2 text-sm text-text"
      >
        Skip to content
      </a>

      <header className="border-b border-border bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <p className="text-lg font-semibold">Rolodex</p>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted">{user.email ?? user.id}</span>
            <button className="btn" onClick={logout}>
              Sign Out
            </button>
          </div>
        </div>
        <nav aria-label="Primary" className="mx-auto max-w-6xl px-4 pb-3">
          <ul className="flex flex-wrap gap-2">
            {navItems.map((item) => (
              <li key={item.to}>
                <NavLink className={({ isActive }) => `nav-link ${isActive ? "nav-link-active" : ""}`} to={item.to}>
                  {item.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>

      <main id="main-content" className="mx-auto max-w-6xl px-4 py-6" tabIndex={-1}>
        {children}
      </main>
    </div>
  );
}
