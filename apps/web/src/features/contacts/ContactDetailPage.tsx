import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { useAuth } from "../auth/AuthContext";
import {
  apiClient,
  type ContactAttribute,
  type ContactComment,
  type ContactDetail,
  type ContactMethod,
  type ContactStatus,
  type ContactType
} from "../../lib/apiClient";

type ContactFormState = {
  firstName: string;
  lastName: string;
  company: string;
  role: string;
  contactType: ContactType | "";
  status: ContactStatus | "";
  internalContact: string;
  referredBy: string;
  referredByContactId: string;
  linkedInProfileUrl: string;
  billingAddress: string;
  shippingAddress: string;
  shippingSameAsBilling: boolean;
  attributes: ContactAttribute[];
  phones: ContactMethod[];
  emails: ContactMethod[];
  websites: ContactMethod[];
};

const typeOptions: ContactType[] = ["Advisor", "Funder", "Partner", "Client", "General"];
const statusOptions: ContactStatus[] = ["Active", "Prospect", "Inactive", "Archived"];
const attributeOptions: ContactAttribute[] = [
  "Academia",
  "Accessible Education",
  "Startup",
  "Not for Profit",
  "AgeTech",
  "Robotics",
  "AI Solutions",
  "Consumer Products",
  "Disability Services",
  "Disability Community"
];

const phoneLabelOptions = ["Mobile", "Work", "Home", "Direct", "Assistant", "Other"];
const emailLabelOptions = ["Work", "Personal", "Billing", "Support", "Other"];
const websiteLabelOptions = ["Company", "LinkedIn", "Personal", "Portfolio", "Other"];

const emptyMethod = (): ContactMethod => ({ label: "", value: "" });

const formatPhoneNumber = (value: string) => {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return value.trim();
};

const normalizeAttributes = (value: unknown): ContactAttribute[] => {
  if (Array.isArray(value)) {
    return value.filter((item): item is ContactAttribute => typeof item === "string");
  }

  if (typeof value !== "string") return [];
  const trimmed = value.trim();
  if (!trimmed) return [];

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const inner = trimmed.slice(1, -1).trim();
    if (!inner) return [];
    return inner
      .split(",")
      .map((item) => item.trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"'))
      .filter((item): item is ContactAttribute => item.length > 0);
  }

  return trimmed
    .split(",")
    .map((item) => item.trim())
    .filter((item): item is ContactAttribute => item.length > 0);
};

const normalizePersonName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const displayNameFromIdentity = (value?: string) => {
  if (!value) return "Unknown user";
  const source = value.includes("@") ? value.split("@")[0] : value;
  const cleaned = source.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return value;
  return cleaned
    .split(/\s+/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
};

const toFormState = (detail: ContactDetail): ContactFormState => ({
  firstName: detail.firstName,
  lastName: detail.lastName,
  company: detail.company ?? "",
  role: detail.role ?? "",
  contactType: detail.contactType,
  status: detail.status,
  internalContact: detail.internalContact ?? "",
  referredBy: detail.referredByContact ? `${detail.referredByContact.firstName} ${detail.referredByContact.lastName}` : detail.referredBy ?? "",
  referredByContactId: detail.referredByContactId ?? "",
  linkedInProfileUrl: detail.linkedInProfileUrl ?? "",
  billingAddress: detail.billingAddress ?? "",
  shippingAddress: detail.shippingAddress ?? "",
  shippingSameAsBilling: Boolean(detail.shippingSameAsBilling),
  attributes: normalizeAttributes(detail.attributes),
  phones: detail.phones.length > 0 ? detail.phones : [emptyMethod()],
  emails: detail.emails.length > 0 ? detail.emails : [emptyMethod()],
  websites: detail.websites.length > 0 ? detail.websites : [emptyMethod()]
});

function ViewField({ label, value }: { label: string; value: string }) {
  return (
    <div className="contact-view-field">
      <p className="contact-view-label">{label}</p>
      <p className="contact-view-value">{value || "-"}</p>
    </div>
  );
}

function MethodsView({
  label,
  emptyText,
  items
}: {
  label: string;
  emptyText: string;
  items: ContactMethod[];
}) {
  const filled = items.filter((item) => item.value.trim().length > 0);

  return (
    <section className="contact-card" aria-label={label}>
      <h3 className="contact-section-title">{label}</h3>
      {filled.length === 0 ? <p className="contact-empty-text">{emptyText}</p> : null}
      {filled.length > 0 ? (
        <ul className="contact-method-list">
          {filled.map((item, index) => (
            <li key={`${label}-${index}`} className="contact-method-item">
              <span className="contact-method-label">{item.label || "Other"}</span>
              <span className="contact-method-value">{item.value}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function MethodsEditor({
  label,
  labelOptions,
  valueType,
  items,
  disabled,
  onChange,
  onAdd,
  addActionLabel,
  onValueBlur
}: {
  label: string;
  labelOptions: string[];
  valueType: "tel" | "email" | "url";
  items: ContactMethod[];
  disabled: boolean;
  onChange: (index: number, field: "label" | "value", value: string) => void;
  onAdd: () => void;
  addActionLabel: string;
  onValueBlur?: (index: number, value: string) => void;
}) {
  return (
    <section className="contact-card" aria-label={label}>
      <h3 className="contact-section-title">{label}</h3>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${label}-${index}`} className="grid gap-2 md:grid-cols-2">
            <select
              aria-label={`${label} label ${index + 1}`}
              className="input"
              value={item.label ?? ""}
              onChange={(event) => onChange(index, "label", event.target.value)}
              disabled={disabled}
            >
              <option value="">Select label</option>
              {labelOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {item.label && !labelOptions.includes(item.label) ? <option value={item.label}>{item.label}</option> : null}
            </select>
            <input
              aria-label={`${label} value ${index + 1}`}
              className="input"
              type={valueType}
              inputMode={valueType === "tel" ? "tel" : valueType === "email" ? "email" : "url"}
              pattern={valueType === "email" ? ".+@.+" : undefined}
              title={valueType === "email" ? "Include an @ in the email address." : undefined}
              value={item.value}
              onChange={(event) => onChange(index, "value", event.target.value)}
              onBlur={(event) => onValueBlur?.(index, event.target.value)}
              disabled={disabled}
              placeholder="Value"
            />
          </div>
        ))}
      </div>
      <button type="button" className="nav-link mt-3" onClick={onAdd} disabled={disabled}>
        {addActionLabel}
      </button>
    </section>
  );
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();

  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [form, setForm] = useState<ContactFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [newComment, setNewComment] = useState("");
  const [referredByMatches, setReferredByMatches] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [referredByLoading, setReferredByLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("Loading contact...");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmArchive, setConfirmArchive] = useState(false);

  const isAdmin = user?.role === "admin";
  const canEdit = user?.role === "admin" || user?.role === "creator";
  const recordEnteredByDisplay =
    detail?.recordEnteredBy && detail.recordEnteredBy !== "Unknown user"
      ? detail.recordEnteredBy
      : displayNameFromIdentity(user?.email || user?.id);

  const visibleComments = useMemo(() => {
    const all = detail?.comments ?? [];
    return all.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [detail]);
  const detailAttributes = useMemo(() => normalizeAttributes(detail?.attributes), [detail?.attributes]);

  const resolveReferredByContact = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return { status: "empty" as const };

    const result = await apiClient.listContacts(trimmed);
    if (!result.ok || !result.data) {
      return { status: "error" as const, message: result.error?.message || "Unable to validate referred-by contact." };
    }

    const normalized = normalizePersonName(trimmed);
    const exactMatches = result.data.filter((contact) => {
      if (contact.id === id) return false;
      const firstLast = normalizePersonName(`${contact.firstName} ${contact.lastName}`);
      const lastFirst = normalizePersonName(`${contact.lastName}, ${contact.firstName}`);
      return normalized === firstLast || normalized === lastFirst;
    });

    if (exactMatches.length === 0) return { status: "none" as const };
    if (exactMatches.length > 1) return { status: "ambiguous" as const };

    return {
      status: "matched" as const,
      contact: exactMatches[0]
    };
  };

  useEffect(() => {
    if (!id) return;
    apiClient
      .getContact(id)
      .then((result) => {
        if (!result.ok || !result.data) {
          setStatusMessage(result.error?.message || "Contact not found.");
          return;
        }
        setDetail(result.data);
        const initialForm = toFormState(result.data);
        if (searchParams.get("new") === "1") {
          initialForm.contactType = "";
          initialForm.status = "";
        }
        setForm(initialForm);
        if (searchParams.get("edit") === "1") {
          setEditing(true);
        }
        setStatusMessage("Loaded.");
      })
      .catch(() => setStatusMessage("Unable to load contact."));
  }, [id, searchParams]);

  useEffect(() => {
    if (!editing) return;

    const term = form?.referredBy.trim() ?? "";
    if (!term) {
      return;
    }

    const timer = window.setTimeout(() => {
      setReferredByLoading(true);
      apiClient
        .listContacts(term)
        .then((result) => {
          if (!result.ok || !result.data) {
            setReferredByMatches([]);
            return;
          }

          setReferredByMatches(
            result.data
              .filter((contact) => contact.id !== id)
              .slice(0, 8)
              .map((contact) => ({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName }))
          );
        })
        .finally(() => setReferredByLoading(false));
    }, 200);

    return () => window.clearTimeout(timer);
  }, [editing, form?.referredBy, id]);

  const refresh = async () => {
    if (!id) return;
    const result = await apiClient.getContact(id);
    if (result.ok && result.data) {
      setDetail(result.data);
      setForm(toFormState(result.data));
    }
  };

  const setMethodField = (group: "phones" | "emails" | "websites", index: number, field: "label" | "value", value: string) => {
    setForm((prev) => {
      if (!prev) return prev;
      const nextItems = prev[group].map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item));
      return { ...prev, [group]: nextItems };
    });
  };

  const addMethod = (group: "phones" | "emails" | "websites") => {
    setForm((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        [group]: [...prev[group], emptyMethod()]
      };
    });
  };

  const save = async (closeAfter = false) => {
    if (!id || !form) return;

    if (!form.contactType || !form.status) {
      setStatusMessage("Type and Status are required.");
      return;
    }

    let resolvedReferredBy = form.referredBy.trim();
    let resolvedReferredByContactId = form.referredByContactId;
    if (resolvedReferredBy && !resolvedReferredByContactId) {
      const resolution = await resolveReferredByContact(resolvedReferredBy);
      if (resolution.status === "none") {
        setStatusMessage("Referred By must match an existing contact.");
        return;
      }
      if (resolution.status === "ambiguous") {
        setStatusMessage("Multiple contacts match Referred By. Please choose one from suggestions.");
        return;
      }
      if (resolution.status === "error") {
        setStatusMessage(resolution.message);
        return;
      }
      if (resolution.status === "matched") {
        resolvedReferredBy = `${resolution.contact.firstName} ${resolution.contact.lastName}`;
        resolvedReferredByContactId = resolution.contact.id;
        setForm((prev) =>
          prev
            ? {
                ...prev,
                referredBy: resolvedReferredBy,
                referredByContactId: resolvedReferredByContactId
              }
            : prev
        );
      }
    }

    const invalidEmail = form.emails.find((entry) => entry.value.trim().length > 0 && !entry.value.includes("@"));
    if (invalidEmail) {
      setStatusMessage("Email addresses must include @.");
      return;
    }

    setStatusMessage("Saving contact...");
    const payload = {
      id,
      firstName: form.firstName,
      lastName: form.lastName,
      company: form.company,
      role: form.role,
      contactType: form.contactType,
      status: form.status,
      internalContact: form.internalContact,
      referredBy: resolvedReferredBy,
      referredByContactId: resolvedReferredByContactId || undefined,
      linkedInProfileUrl: form.linkedInProfileUrl || undefined,
      billingAddress: form.billingAddress || undefined,
      shippingAddress: (form.shippingSameAsBilling ? form.billingAddress : form.shippingAddress) || undefined,
      shippingSameAsBilling: form.shippingSameAsBilling,
      attributes: form.attributes,
      phones: form.phones
        .map((entry) => ({ ...entry, value: formatPhoneNumber(entry.value) }))
        .filter((entry) => entry.value.trim().length > 0),
      emails: form.emails.filter((entry) => entry.value.trim().length > 0),
      websites: form.websites.filter((entry) => entry.value.trim().length > 0)
    };

    const result = await apiClient.updateContact(payload);
    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "Save failed.");
      return;
    }

    setDetail(result.data);
    setForm(toFormState(result.data));
    setEditing(false);
    setStatusMessage("Saved.");

    if (closeAfter) {
      navigate("/contacts");
    }
  };

  const onAddComment = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!id || !newComment.trim()) return;

    const result = await apiClient.addComment(id, newComment.trim());
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Unable to add comment.");
      return;
    }

    setNewComment("");
    setStatusMessage("Comment added.");
    await refresh();
  };

  const onArchiveComment = async (comment: ContactComment) => {
    if (!canEdit) return;
    const result = await apiClient.archiveComment(comment.id);
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Unable to archive comment.");
      return;
    }
    await refresh();
  };

  const onDeleteComment = async (comment: ContactComment) => {
    if (!isAdmin) return;
    const result = await apiClient.deleteComment(comment.id);
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Unable to delete comment.");
      return;
    }
    await refresh();
  };

  const onArchiveContact = async () => {
    if (!id || !form || !canEdit) return;
    if (!form.contactType) {
      setStatusMessage("Type is required before archiving.");
      return;
    }

    let resolvedReferredBy = form.referredBy.trim();
    let resolvedReferredByContactId = form.referredByContactId;
    if (resolvedReferredBy && !resolvedReferredByContactId) {
      const resolution = await resolveReferredByContact(resolvedReferredBy);
      if (resolution.status === "none") {
        setStatusMessage("Referred By must match an existing contact.");
        return;
      }
      if (resolution.status === "ambiguous") {
        setStatusMessage("Multiple contacts match Referred By. Please choose one from suggestions.");
        return;
      }
      if (resolution.status === "error") {
        setStatusMessage(resolution.message);
        return;
      }
      if (resolution.status === "matched") {
        resolvedReferredBy = `${resolution.contact.firstName} ${resolution.contact.lastName}`;
        resolvedReferredByContactId = resolution.contact.id;
      }
    }

    const payload = {
      id,
      firstName: form.firstName,
      lastName: form.lastName,
      company: form.company,
      role: form.role,
      contactType: form.contactType as ContactType,
      status: "Archived" as const,
      internalContact: form.internalContact,
      referredBy: resolvedReferredBy,
      referredByContactId: resolvedReferredByContactId || undefined,
      linkedInProfileUrl: form.linkedInProfileUrl || undefined,
      billingAddress: form.billingAddress || undefined,
      shippingAddress: (form.shippingSameAsBilling ? form.billingAddress : form.shippingAddress) || undefined,
      shippingSameAsBilling: form.shippingSameAsBilling,
      attributes: form.attributes,
      phones: form.phones
        .map((entry) => ({ ...entry, value: formatPhoneNumber(entry.value) }))
        .filter((entry) => entry.value.trim().length > 0),
      emails: form.emails.filter((entry) => entry.value.trim().length > 0),
      websites: form.websites.filter((entry) => entry.value.trim().length > 0)
    };
    const result = await apiClient.updateContact(payload);
    setConfirmArchive(false);
    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "Unable to archive contact.");
      return;
    }
    setDetail(result.data);
    setForm(toFormState(result.data));
    setStatusMessage("Contact archived.");
  };

  const onDeleteContact = async () => {
    if (!id || !isAdmin) return;
    const result = await apiClient.deleteContact(id);
    setConfirmDelete(false);
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Unable to delete contact.");
      return;
    }
    navigate("/contacts");
  };

  if (!id) {
    return <p>Missing contact ID.</p>;
  }

  if (!detail || !form) {
    return (
      <section aria-labelledby="contact-loading-title">
        <h1 id="contact-loading-title" className="text-2xl font-semibold">
          Contact
        </h1>
        <p aria-live="polite" className="mt-2 text-muted">
          {statusMessage}
        </p>
      </section>
    );
  }

  return (
    <section aria-labelledby="contact-title" className="contact-page space-y-4">
      <header className="contact-card contact-header-card">
        <div>
          <h1 id="contact-title" className="contact-name">
            {detail.lastName}, {detail.firstName}
          </h1>
          <p className="contact-meta">Record entered by: {recordEnteredByDisplay}</p>
        </div>
        {canEdit ? (
          <button className="btn" onClick={() => setEditing((value) => !value)} aria-label="Edit contact">
            {editing ? "View" : "Edit"}
          </button>
        ) : null}
      </header>

      <section className="contact-card" aria-label="Summary Fields">
        {editing ? (
          <div className="grid gap-3 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm text-muted">First Name</span>
              <input className="input" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Last Name</span>
              <input className="input" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Company</span>
              <input className="input" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Role</span>
              <input className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Type</span>
              <select
                className="input"
                value={form.contactType}
                onChange={(event) => setForm({ ...form, contactType: event.target.value as ContactType | "" })}
              >
                <option value="" disabled>
                  Select type
                </option>
                {typeOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Status</span>
              <select
                className="input"
                value={form.status}
                onChange={(event) => setForm({ ...form, status: event.target.value as ContactStatus | "" })}
              >
                <option value="" disabled>
                  Select status
                </option>
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Internal Contact</span>
              <input className="input" value={form.internalContact} onChange={(event) => setForm({ ...form, internalContact: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">LinkedIn Profile URL</span>
              <input className="input" value={form.linkedInProfileUrl} onChange={(event) => setForm({ ...form, linkedInProfileUrl: event.target.value })} />
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Referred By</span>
              <input
                className="input"
                value={form.referredBy}
                onChange={(event) =>
                  setForm({
                    ...form,
                    referredBy: event.target.value,
                    referredByContactId: ""
                  })
                }
                onInput={() => setReferredByMatches([])}
                onBlur={() => {
                  if (!form.referredBy.trim() || form.referredByContactId) return;
                  void resolveReferredByContact(form.referredBy).then((resolution) => {
                    if (resolution.status !== "matched") return;
                    setForm((prev) =>
                      prev
                        ? {
                            ...prev,
                            referredBy: `${resolution.contact.firstName} ${resolution.contact.lastName}`,
                            referredByContactId: resolution.contact.id
                          }
                        : prev
                    );
                  });
                }}
                role="combobox"
                aria-autocomplete="list"
                aria-expanded={referredByMatches.length > 0}
                aria-controls="referred-by-suggestions"
              />
              <div className="mt-2 rounded border border-border bg-canvas p-2">
                {referredByLoading ? <p className="text-xs text-muted">Loading suggestions...</p> : null}
                {!referredByLoading && referredByMatches.length === 0 && form.referredBy.trim() ? (
                  <p className="text-xs text-muted">No matching contacts.</p>
                ) : null}
                {!referredByLoading && referredByMatches.length > 0 ? (
                  <ul id="referred-by-suggestions" className="space-y-1" aria-label="Referred by suggestions">
                    {referredByMatches.map((contact) => (
                      <li key={contact.id}>
                        <button
                          type="button"
                          className="nav-link w-full text-left"
                          onClick={() =>
                            setForm((prev) => {
                              if (!prev) return prev;
                              return {
                                ...prev,
                                referredBy: `${contact.firstName} ${contact.lastName}`,
                                referredByContactId: contact.id
                              };
                            })
                          }
                        >
                          {contact.lastName}, {contact.firstName}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </label>
            <label className="md:col-span-2">
              <span className="mb-1 block text-sm text-muted">Billing Address</span>
              <textarea
                className="input min-h-24"
                value={form.billingAddress}
                onChange={(event) => {
                  const billingAddress = event.target.value;
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          billingAddress,
                          shippingAddress: prev.shippingSameAsBilling ? billingAddress : prev.shippingAddress
                        }
                      : prev
                  );
                }}
              />
            </label>
            <label className="inline-flex items-center gap-2 md:col-span-2">
              <input
                type="checkbox"
                checked={form.shippingSameAsBilling}
                onChange={(event) => {
                  const checked = event.target.checked;
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          shippingSameAsBilling: checked,
                          shippingAddress: checked ? prev.billingAddress : prev.shippingAddress
                        }
                      : prev
                  );
                }}
              />
              <span>Shipping address is the same as billing</span>
            </label>
            <label className="md:col-span-2">
              <span className="mb-1 block text-sm text-muted">Shipping Address</span>
              <textarea
                className="input min-h-24"
                value={form.shippingSameAsBilling ? form.billingAddress : form.shippingAddress}
                onChange={(event) =>
                  setForm((prev) =>
                    prev
                      ? {
                          ...prev,
                          shippingAddress: event.target.value
                        }
                      : prev
                  )
                }
                disabled={form.shippingSameAsBilling}
              />
            </label>
          </div>
        ) : (
          <>
            <div className="contact-view-grid">
              <ViewField label="Company" value={detail.company || "-"} />
              <ViewField label="Role" value={detail.role || "-"} />
              <ViewField label="Status" value={detail.status || "-"} />
            </div>
            <div className="contact-view-grid mt-3">
              <ViewField label="Internal Contact" value={detail.internalContact || "-"} />
              <ViewField
                label="Referred By"
                value={detail.referredByContact ? `${detail.referredByContact.firstName} ${detail.referredByContact.lastName}` : detail.referredBy || "-"}
              />
              <ViewField label="LinkedIn" value={detail.linkedInProfileUrl || "-"} />
            </div>
          </>
        )}
      </section>

      <section className="contact-card" aria-label="Attributes">
        <h2 className="contact-section-title">Attributes</h2>
        {editing ? (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {attributeOptions.map((attribute) => (
              <label key={attribute} className="inline-flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.attributes.includes(attribute)}
                  onChange={(event) =>
                    setForm((prev) => {
                      if (!prev) return prev;
                      const set = new Set(prev.attributes);
                      if (event.target.checked) {
                        set.add(attribute);
                      } else {
                        set.delete(attribute);
                      }
                      return { ...prev, attributes: Array.from(set) };
                    })
                  }
                />
                <span>{attribute}</span>
              </label>
            ))}
          </div>
        ) : (
          <div className="contact-chip-list">
            {detailAttributes.length === 0 ? <p className="contact-empty-text">No attributes assigned.</p> : null}
            {detailAttributes.map((attribute) => (
              <span key={attribute} className="contact-chip">
                {attribute}
              </span>
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        {editing ? (
          <>
            <MethodsEditor
              label="Phone Numbers"
              labelOptions={phoneLabelOptions}
              valueType="tel"
              items={form.phones}
              disabled={false}
              onChange={(index, field, value) => setMethodField("phones", index, field, value)}
              onAdd={() => addMethod("phones")}
              addActionLabel="Add New Number"
              onValueBlur={(index, value) => setMethodField("phones", index, "value", formatPhoneNumber(value))}
            />
            <MethodsEditor
              label="Email Addresses"
              labelOptions={emailLabelOptions}
              valueType="email"
              items={form.emails}
              disabled={false}
              onChange={(index, field, value) => setMethodField("emails", index, field, value)}
              onAdd={() => addMethod("emails")}
              addActionLabel="Add New Email"
            />
            <MethodsEditor
              label="Websites"
              labelOptions={websiteLabelOptions}
              valueType="url"
              items={form.websites}
              disabled={false}
              onChange={(index, field, value) => setMethodField("websites", index, field, value)}
              onAdd={() => addMethod("websites")}
              addActionLabel="Add New Website"
            />
          </>
        ) : (
          <>
            <MethodsView label="Phone Number" emptyText="No phone numbers added" items={detail.phones} />
            <MethodsView label="Email Addresses" emptyText="No email addresses added" items={detail.emails} />
            <MethodsView label="Website" emptyText="No websites added" items={detail.websites} />
          </>
        )}
      </div>

      <section className="contact-card" aria-label="Addresses">
        <h2 className="contact-section-title">Addresses</h2>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <div className="rounded border border-border bg-canvas p-3">
            <p className="text-sm text-muted">Billing Address</p>
            <p className="mt-2 whitespace-pre-wrap">{detail.billingAddress || "-"}</p>
          </div>
          <div className="rounded border border-border bg-canvas p-3">
            <p className="text-sm text-muted">Shipping Address</p>
            <p className="mt-2 whitespace-pre-wrap">
              {detail.shippingSameAsBilling ? detail.billingAddress || "-" : detail.shippingAddress || "-"}
            </p>
          </div>
        </div>
      </section>

      <section className="contact-card" aria-label="Referrals">
        <h2 className="contact-section-title">Referrals</h2>
        {detail.referrals.length === 0 ? <p className="contact-empty-text">No referrals linked to this contact.</p> : null}
        <ul className="mt-2 space-y-1">
          {detail.referrals.map((referral) => (
            <li key={referral.id}>
              <Link to={`/contacts/${referral.id}`} className="nav-link">
                {referral.lastName}, {referral.firstName}
              </Link>
            </li>
          ))}
        </ul>
      </section>

      <section className="contact-card" aria-label="Comments">
        <h2 className="contact-section-title">Comments</h2>
        <form className="mt-3 flex flex-col gap-2" onSubmit={(event) => void onAddComment(event)}>
          <textarea
            className="input min-h-24"
            value={newComment}
            onChange={(event) => setNewComment(event.target.value)}
            placeholder="Add comment"
            aria-label="Add comment"
          />
          <button type="submit" className="btn self-start">
            Add Comment
          </button>
        </form>

        <ul className="mt-4 space-y-2">
          {visibleComments.map((comment) => (
            <li key={comment.id} className="contact-comment-item">
              <p className="text-xs text-muted">
                {new Date(comment.createdAt).toLocaleString()} by {comment.authorDisplayName || "Unknown user"}
              </p>
              <p className="mt-2 whitespace-pre-wrap">{comment.body}</p>
              {comment.archived ? <p className="mt-2 text-sm text-muted">Archived</p> : null}
              <div className="mt-2 flex gap-2">
                {canEdit && !comment.archived ? (
                  <button type="button" className="btn" onClick={() => void onArchiveComment(comment)}>
                    Archive
                  </button>
                ) : null}
                {isAdmin ? (
                  <button type="button" className="btn" onClick={() => void onDeleteComment(comment)}>
                    Delete
                  </button>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      </section>

      <footer className="flex flex-wrap gap-2 border-t border-border pt-4">
        {editing ? (
          <>
            <button type="button" className="btn" onClick={() => void save(false)} disabled={!canEdit}>
              Save
            </button>
            <button type="button" className="btn" onClick={() => void save(true)} disabled={!canEdit}>
              Save &amp; Close
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setForm(toFormState(detail));
                setEditing(false);
                setStatusMessage("Changes canceled.");
              }}
            >
              Cancel
            </button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => navigate("/contacts")}>
            Back to Contacts
          </button>
        )}
        <button type="button" className="btn" onClick={() => setConfirmArchive(true)} disabled={!canEdit}>
          Archive
        </button>
        {isAdmin ? (
          <button type="button" className="btn" onClick={() => setConfirmDelete(true)}>
            Delete
          </button>
        ) : null}
      </footer>

      <p aria-live="polite" className="text-sm text-muted">
        {statusMessage}
      </p>

      <Modal open={confirmArchive} onClose={() => setConfirmArchive(false)} title="Archive Contact" labelledById="archive-contact-title">
        <p>Archive this contact?</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={() => void onArchiveContact()}>
            Confirm Archive
          </button>
          <button type="button" className="btn" onClick={() => setConfirmArchive(false)}>
            Cancel
          </button>
        </div>
      </Modal>

      <Modal open={confirmDelete} onClose={() => setConfirmDelete(false)} title="Delete Contact" labelledById="delete-contact-title">
        <p>This action cannot be undone.</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={() => void onDeleteContact()}>
            Confirm Delete
          </button>
          <button type="button" className="btn" onClick={() => setConfirmDelete(false)}>
            Cancel
          </button>
        </div>
      </Modal>
    </section>
  );
}
