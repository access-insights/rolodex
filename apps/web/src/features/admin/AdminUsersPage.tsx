import { useEffect, useState } from "react";
import { apiClient, type UserListItem } from "../../lib/apiClient";

export function AdminUsersPage() {
  const [users, setUsers] = useState<UserListItem[]>([]);

  useEffect(() => {
    apiClient.listUsers().then((result) => {
      if (result.ok && result.data) {
        setUsers(result.data);
      }
    }).catch(() => {
      setUsers([]);
    });
  }, []);

  return (
    <section aria-labelledby="admin-users-title">
      <h1 id="admin-users-title" className="text-2xl font-semibold">
        User Administration
      </h1>
      <p className="mt-2 text-muted">Admin-only placeholder page for listing and updating roles.</p>
      <ul className="mt-4 space-y-2">
        {users.map((user) => (
          <li key={user.id} className="rounded border border-border bg-surface p-3">
            {user.id} ({user.role})
          </li>
        ))}
      </ul>
    </section>
  );
}
