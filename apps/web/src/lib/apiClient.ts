export type ApiEnvelope<T> = {
  ok: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: Record<string, unknown>;
};

export type AppRole = "admin" | "creator" | "participant";
export type ContactType = "Advisor" | "Funder" | "Partner" | "Client" | "General";
export type ContactStatus = "Active" | "Prospect" | "Inactive" | "Archived";
export type ContactAttribute =
  | "Academia"
  | "Accessible Education"
  | "Startup"
  | "Not for Profit"
  | "AgeTech"
  | "Robotics"
  | "AI Solutions"
  | "Consumer Products"
  | "Disability Services"
  | "Disability Community";

export type ContactMethod = {
  id?: string;
  label?: string | null;
  value: string;
  createdAt?: string;
};

export type ContactComment = {
  id: string;
  body: string;
  archived: boolean;
  createdAt: string;
  authorDisplayName?: string;
};

export type ContactListItem = {
  id: string;
  firstName: string;
  lastName: string;
  orgId?: string;
  company?: string | null;
  role?: string | null;
  internalContact?: string | null;
  referredBy?: string | null;
  referredByContactId?: string | null;
  contactType: ContactType;
  status: ContactStatus;
  linkedInProfileUrl?: string | null;
  linkedInPictureUrl?: string | null;
  linkedInCompany?: string | null;
  linkedInJobTitle?: string | null;
  linkedInLocation?: string | null;
  attributes: ContactAttribute[];
  recordEnteredBy?: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ContactDetail = ContactListItem & {
  referredByContact?: {
    id: string;
    firstName: string;
    lastName: string;
  } | null;
  phones: ContactMethod[];
  emails: ContactMethod[];
  websites: ContactMethod[];
  referrals: Array<{
    id: string;
    firstName: string;
    lastName: string;
  }>;
  comments: ContactComment[];
};

export type UserListItem = {
  id: string;
  role: AppRole;
  orgId: string;
  subject?: string;
  email?: string | null;
  displayName?: string | null;
};

export type UserRoleUpdateResult = {
  id: string;
  role: AppRole;
  updated: boolean;
};

export type ContactUpsertInput = {
  id?: string;
  firstName: string;
  lastName: string;
  company?: string;
  role?: string;
  contactType: ContactType;
  status: ContactStatus;
  internalContact?: string;
  referredBy?: string;
  referredByContactId?: string;
  linkedInProfileUrl?: string;
  allowDuplicate?: boolean;
  attributes?: ContactAttribute[];
  phones?: ContactMethod[];
  emails?: ContactMethod[];
  websites?: ContactMethod[];
};

const apiBase = import.meta.env.VITE_API_BASE || "/api";
let apiAuthToken: string | null = null;

export const setApiAuthToken = (token: string | null) => {
  apiAuthToken = token;
};

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
      ...(apiAuthToken ? { authorization: `Bearer ${apiAuthToken}` } : {}),
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
    request<UserRoleUpdateResult>("users/update-role", {
      method: "POST",
      body: JSON.stringify({ userId, role })
    }),

  listContacts: (search?: string) =>
    request<ContactListItem[]>("contact.list", undefined, search ? { search } : {}),
  getContact: (id: string) => request<ContactDetail>("contact.get", undefined, { id }),
  createContact: (payload: ContactUpsertInput) =>
    request<ContactDetail>("entities/create", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  updateContact: (payload: ContactUpsertInput & { id: string }) =>
    request<ContactDetail>("contact.update", {
      method: "POST",
      body: JSON.stringify(payload)
    }),
  deleteContact: (id: string) => request<{ deleted: boolean }>("contact.delete", undefined, { id }),

  importCsv: (csvContent: string) =>
    request<{ insertedCount: number; insertedIds: string[] }>("contact.importCsv", {
      method: "POST",
      body: JSON.stringify({ csvContent })
    }),

  addComment: (contactId: string, body: string) =>
    request<ContactComment>("contact.addComment", {
      method: "POST",
      body: JSON.stringify({ contactId, body })
    }),

  archiveComment: (commentId: string) =>
    request<{ archived: boolean; id: string }>("contact.archiveComment", {
      method: "POST",
      body: JSON.stringify({ commentId })
    }),

  deleteComment: (commentId: string) =>
    request<{ deleted: boolean; id: string }>("contact.deleteComment", {
      method: "POST",
      body: JSON.stringify({ commentId })
    }),

  exportCsv: () => request<{ message: string; url: string }>("csv/export")
};
