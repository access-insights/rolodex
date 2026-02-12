import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "../components/AppShell";
import { RouteGuard } from "../components/RouteGuard";
import { LoginPage } from "../features/auth/LoginPage";
import { ContactsListPage } from "../features/contacts/ContactsListPage";
import { ContactCreatePage } from "../features/contacts/ContactCreatePage";
import { AdminUsersPage } from "../features/admin/AdminUsersPage";

export function App() {
  return (
    <AppShell>
      <Routes>
        <Route path="/" element={<Navigate to="/contacts" replace />} />
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/contacts"
          element={
            <RouteGuard allowRoles={["admin", "creator", "participant"]}>
              <ContactsListPage />
            </RouteGuard>
          }
        />
        <Route
          path="/contacts/new"
          element={
            <RouteGuard allowRoles={["admin", "creator"]}>
              <ContactCreatePage />
            </RouteGuard>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RouteGuard allowRoles={["admin"]}>
              <AdminUsersPage />
            </RouteGuard>
          }
        />
        <Route path="*" element={<Navigate to="/contacts" replace />} />
      </Routes>
    </AppShell>
  );
}
