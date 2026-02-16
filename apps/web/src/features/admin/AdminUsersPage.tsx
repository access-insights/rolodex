import { useEffect, useMemo, useState } from "react";
import { apiClient, type UserListItem } from "../../lib/apiClient";

const roleOptions: UserListItem["role"][] = ["admin", "creator", "participant"];

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);
  const [draftRoles, setDraftRoles] = useState<Record<string, UserListItem["role"]>>({});
  const [savingUserId, setSavingUserId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading users...");
  const [filter, setFilter] = useState("");

  const loadUsers = async () => {
    setStatusMessage("Loading users...");
    const result = await apiClient.listUsers();
    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "Unable to load users.");
      setUsers([]);
      return;
    }
    setUsers(result.data);
    setStatusMessage(`Loaded ${result.data.length} user account(s).`);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadUsers();
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  const visibleUsers = useMemo(() => {
    const term = filter.trim().toLowerCase();
    if (!term) return users;
    return users.filter((user) => {
      const name = (user.displayName || "").toLowerCase();
      const email = (user.email || "").toLowerCase();
      const subject = (user.subject || "").toLowerCase();
      return name.includes(term) || email.includes(term) || subject.includes(term) || user.role.includes(term);
    });
  }, [users, filter]);

  const saveRole = async (user: UserListItem) => {
    const nextRole = draftRoles[user.id] ?? user.role;
    if (nextRole === user.role) return;

    setSavingUserId(user.id);
    const result = await apiClient.updateUserRole(user.id, nextRole);
    setSavingUserId(null);

    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "Unable to update role.");
      return;
    }

    if (!result.data.updated) {
      setStatusMessage("No changes were applied.");
      return;
    }

    setUsers((prev) => prev.map((item) => (item.id === user.id ? { ...item, role: nextRole } : item)));
    setDraftRoles((prev) => {
      const clone = { ...prev };
      delete clone[user.id];
      return clone;
    });
    setStatusMessage(`Updated role for ${user.displayName || user.email || user.id}.`);
  };

  return (
    <section aria-labelledby="admin-users-title" className="space-y-4">
      <h1 id="admin-users-title" className="text-2xl font-semibold">
        Admin
      </h1>
      <p className="text-muted">Manage user accounts and role assignments.</p>

      <div className="rounded border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_auto]">
          <label>
            <span className="mb-1 block text-sm text-muted">Find user</span>
            <input
              className="input"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search by name, email, subject, or role"
            />
          </label>
          <button type="button" className="btn self-end" onClick={() => void loadUsers()}>
            Refresh
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded border border-border bg-surface">
        <table className="min-w-full border-collapse">
          <caption className="sr-only">Admin users table</caption>
          <thead>
            <tr className="border-b border-border text-left">
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Email</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Role</th>
              <th className="px-3 py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {visibleUsers.length === 0 ? (
              <tr>
                <td className="px-3 py-3 text-muted" colSpan={5}>
                  No users match your filter.
                </td>
              </tr>
            ) : (
              visibleUsers.map((user) => {
                const nextRole = draftRoles[user.id] ?? user.role;
                const changed = nextRole !== user.role;
                const saving = savingUserId === user.id;

                return (
                  <tr key={user.id} className="border-b border-border align-top">
                    <td className="px-3 py-2">{user.displayName || "-"}</td>
                    <td className="px-3 py-2">{user.email || "-"}</td>
                    <td className="px-3 py-2 text-sm text-muted">{user.subject || user.id}</td>
                    <td className="px-3 py-2">
                      <select
                        className="input"
                        value={nextRole}
                        onChange={(event) =>
                          setDraftRoles((prev) => ({
                            ...prev,
                            [user.id]: event.target.value as UserListItem["role"]
                          }))
                        }
                        disabled={saving}
                      >
                        {roleOptions.map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-3 py-2">
                      <button type="button" className="btn" disabled={!changed || saving} onClick={() => void saveRole(user)}>
                        {saving ? "Saving..." : "Save Role"}
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <p className="text-sm text-muted" aria-live="polite">
        {statusMessage}
      </p>
    </section>
  );
}
