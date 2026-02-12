export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: Record<string, unknown>;
};

export type ContactListItem = {
  id: string;
  firstName: string;
  lastName: string;
  orgId?: string;
};

export type UserListItem = {
  id: string;
  role: "admin" | "creator" | "participant";
  orgId: string;
};

type CreateEntityInput = {
  firstName: string;
  lastName: string;
  organization: string;
  role: string;
  contactType: "Advisor" | "Client" | "Funder" | "Partner";
  status: "Active" | "Prospect";
};

const apiBase = import.meta.env.VITE_API_BASE || "/api";

async function request<T>(
  action: string,
  init?: RequestInit,
  query: Record<string, string> = {}
): Promise<ApiEnvelope<T>> {
  const url = new URL(apiBase, window.location.origin);
  url.searchParams.set("action", action);
  Object.entries(query).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  const response = await fetch(url.pathname + url.search, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers || {})
    }
  });

  const data = (await response.json()) as ApiEnvelope<T>;
  return data;
}

export const apiClient = {
  me: () => request<{ id: string; email?: string; role: string; orgId: string }>("me"),
  listUsers: () => request<UserListItem[]>("users/list"),
  updateUserRole: (userId: string, role: UserListItem["role"]) =>
    request<UserListItem>("users/update-role", {
      method: "POST",
      body: JSON.stringify({ userId, role })
    }),
  listEntities: () => request<ContactListItem[]>("entities/list"),
  getEntity: (id: string) => request<ContactListItem>("entities/get", undefined, { id }),
  createEntity: (payload: CreateEntityInput) =>
    request<ContactListItem>("entities/create", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateEntity: (payload: CreateEntityInput & { id: string }) =>
    request<ContactListItem>("entities/update", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteEntity: (id: string) => request<{ deleted: boolean }>("entities/delete", undefined, { id }),
  exportCsv: () => request<{ message: string; url: string }>("csv/export")
};
