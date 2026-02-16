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
  attributes: normalizeAttributes(detail.attributes),
  phones: detail.phones.length > 0 ? detail.phones : [emptyMethod()],
  emails: detail.emails.length > 0 ? detail.emails : [emptyMethod()],
  websites: detail.websites.length > 0 ? detail.websites : [emptyMethod()]
});

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
    <section className="rounded border border-border bg-surface p-4" aria-label={label}>
      <h3 className="mb-3 text-lg font-semibold">{label}</h3>
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

  const visibleComments = useMemo(() => {
    const all = detail?.comments ?? [];
    return all.slice().sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [detail]);

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

    if (form.referredBy.trim() && !form.referredByContactId) {
      setStatusMessage("Select a referred-by contact from suggestions.");
      return;
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
      referredBy: form.referredBy,
      referredByContactId: form.referredByContactId || undefined,
      linkedInProfileUrl: form.linkedInProfileUrl || undefined,
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
    const payload = {
      id,
      firstName: form.firstName,
      lastName: form.lastName,
      company: form.company,
      role: form.role,
      contactType: form.contactType as ContactType,
      status: "Archived" as const,
      internalContact: form.internalContact,
      referredBy: form.referredBy,
      referredByContactId: form.referredByContactId || undefined,
      linkedInProfileUrl: form.linkedInProfileUrl || undefined,
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
    <section aria-labelledby="contact-title" className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 id="contact-title" className="text-2xl font-semibold">
            {detail.lastName}, {detail.firstName}
          </h1>
          <p className="text-sm text-muted">
            Record entered by: {detail.recordEnteredBy || "Unknown user"}
          </p>
        </div>
        {canEdit ? (
          <button className="btn" onClick={() => setEditing((value) => !value)} aria-label="Edit contact">
            {editing ? "View" : "Edit"}
          </button>
        ) : null}
      </header>

      <section className="grid gap-3 rounded border border-border bg-surface p-4 md:grid-cols-2" aria-label="Summary Fields">
        <label>
          <span className="mb-1 block text-sm text-muted">First Name</span>
          <input className="input" value={form.firstName} onChange={(event) => setForm({ ...form, firstName: event.target.value })} disabled={!editing} />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Last Name</span>
          <input className="input" value={form.lastName} onChange={(event) => setForm({ ...form, lastName: event.target.value })} disabled={!editing} />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Company</span>
          <input className="input" value={form.company} onChange={(event) => setForm({ ...form, company: event.target.value })} disabled={!editing} />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Role</span>
          <input className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })} disabled={!editing} />
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Type</span>
          <select
            className="input"
            value={form.contactType}
            onChange={(event) => setForm({ ...form, contactType: event.target.value as ContactType | "" })}
            disabled={!editing}
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
            disabled={!editing}
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
          <input className="input" value={form.internalContact} onChange={(event) => setForm({ ...form, internalContact: event.target.value })} disabled={!editing} />
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
            disabled={!editing}
            role="combobox"
            aria-autocomplete="list"
            aria-expanded={editing && referredByMatches.length > 0}
            aria-controls="referred-by-suggestions"
          />
          {editing ? (
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
          ) : null}
        </label>
      </section>

      <section className="rounded border border-border bg-surface p-4" aria-label="Attributes">
        <h2 className="text-xl font-semibold">Attributes</h2>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {attributeOptions.map((attribute) => (
            <label key={attribute} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.attributes.includes(attribute)}
                disabled={!editing}
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
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <MethodsEditor
          label="Phone Numbers"
          labelOptions={phoneLabelOptions}
          valueType="tel"
          items={form.phones}
          disabled={!editing}
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
          disabled={!editing}
          onChange={(index, field, value) => setMethodField("emails", index, field, value)}
          onAdd={() => addMethod("emails")}
          addActionLabel="Add New Email"
        />
        <MethodsEditor
          label="Websites"
          labelOptions={websiteLabelOptions}
          valueType="url"
          items={form.websites}
          disabled={!editing}
          onChange={(index, field, value) => setMethodField("websites", index, field, value)}
          onAdd={() => addMethod("websites")}
          addActionLabel="Add New Website"
        />
      </div>

      <section className="rounded border border-border bg-surface p-4" aria-label="Referrals">
        <h2 className="text-xl font-semibold">Referrals</h2>
        {detail.referrals.length === 0 ? <p className="mt-2 text-muted">No referrals linked to this contact.</p> : null}
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

      <section className="rounded border border-border bg-surface p-4" aria-label="Comments">
        <h2 className="text-xl font-semibold">Comments</h2>
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
            <li key={comment.id} className="rounded border border-border p-3">
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
        <button type="button" className="btn" onClick={() => void save(false)} disabled={!canEdit || !editing}>
          Save
        </button>
        <button type="button" className="btn" onClick={() => void save(true)} disabled={!canEdit || !editing}>
          Save &amp; Close
        </button>
        <button type="button" className="btn" onClick={() => setConfirmArchive(true)} disabled={!canEdit}>
          Archive
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => navigate("/contacts")}
        >
          Cancel
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
