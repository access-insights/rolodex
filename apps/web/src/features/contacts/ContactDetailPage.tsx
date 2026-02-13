import { FormEvent, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { useAuth } from "../auth/AuthContext";
import {
  apiClient,
  type ContactComment,
  type ContactDetail,
  type ContactMethod,
  type ContactStatus,
  type ContactType,
  type LinkedInHistoryEntry
} from "../../lib/apiClient";

type ContactFormState = {
  firstName: string;
  lastName: string;
  company: string;
  role: string;
  contactType: ContactType;
  status: ContactStatus;
  internalContact: string;
  referredBy: string;
  referredByContactId: string;
  linkedInProfileUrl: string;
  phones: ContactMethod[];
  emails: ContactMethod[];
  websites: ContactMethod[];
};

const typeOptions: ContactType[] = ["Advisor", "Funder", "Partner", "Client", "General"];
const statusOptions: ContactStatus[] = ["Active", "Prospect", "Inactive", "Archived"];

const emptyMethod = (): ContactMethod => ({ label: "", value: "" });

const toFormState = (detail: ContactDetail): ContactFormState => ({
  firstName: detail.firstName,
  lastName: detail.lastName,
  company: detail.company ?? "",
  role: detail.role ?? "",
  contactType: detail.contactType,
  status: detail.status,
  internalContact: detail.internalContact ?? "",
  referredBy: detail.referredBy ?? "",
  referredByContactId: detail.referredByContactId ?? "",
  linkedInProfileUrl: detail.linkedInProfileUrl ?? "",
  phones: detail.phones.length > 0 ? detail.phones : [emptyMethod()],
  emails: detail.emails.length > 0 ? detail.emails : [emptyMethod()],
  websites: detail.websites.length > 0 ? detail.websites : [emptyMethod()]
});

function MethodsEditor({
  label,
  iconLabel,
  items,
  disabled,
  onChange,
  onAdd
}: {
  label: string;
  iconLabel: string;
  items: ContactMethod[];
  disabled: boolean;
  onChange: (index: number, field: "label" | "value", value: string) => void;
  onAdd: () => void;
}) {
  return (
    <section className="rounded border border-border bg-surface p-4" aria-label={label}>
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-lg font-semibold">
          <span aria-hidden="true" className="mr-2 text-sm text-muted">
            [{iconLabel}]
          </span>
          {label}
        </h3>
        <button type="button" className="btn" onClick={onAdd} disabled={disabled}>
          Add {label.slice(0, -1)}
        </button>
      </div>
      <div className="space-y-3">
        {items.map((item, index) => (
          <div key={`${label}-${index}`} className="grid gap-2 md:grid-cols-2">
            <input
              aria-label={`${label} label ${index + 1}`}
              className="input"
              value={item.label ?? ""}
              onChange={(event) => onChange(index, "label", event.target.value)}
              disabled={disabled}
              placeholder="Label"
            />
            <input
              aria-label={`${label} value ${index + 1}`}
              className="input"
              value={item.value}
              onChange={(event) => onChange(index, "value", event.target.value)}
              disabled={disabled}
              placeholder="Value"
            />
          </div>
        ))}
      </div>
    </section>
  );
}

function LinkedInHistoryModal({
  open,
  entries,
  loading,
  onClose
}: {
  open: boolean;
  entries: LinkedInHistoryEntry[];
  loading: boolean;
  onClose: () => void;
}) {
  return (
    <Modal open={open} onClose={onClose} title="LinkedIn History" labelledById="linkedin-history-title">
      {loading ? <p aria-live="polite">Loading history...</p> : null}
      {!loading && entries.length === 0 ? <p>No LinkedIn snapshots yet.</p> : null}
      <ul className="space-y-3">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded border border-border p-3">
            <p className="text-sm text-muted">Captured {new Date(entry.capturedAt).toLocaleString()}</p>
            <pre className="mt-2 overflow-auto rounded bg-canvas p-2 text-xs">
              {JSON.stringify(entry.snapshot, null, 2)}
            </pre>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

export function ContactDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [form, setForm] = useState<ContactFormState | null>(null);
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [history, setHistory] = useState<LinkedInHistoryEntry[]>([]);
  const [newComment, setNewComment] = useState("");
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
        setForm(toFormState(result.data));
        setStatusMessage("Loaded.");
      })
      .catch(() => setStatusMessage("Unable to load contact."));
  }, [id]);

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
      phones: form.phones.filter((entry) => entry.value.trim().length > 0),
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

  const updateLinkedIn = async () => {
    if (!id || !form?.linkedInProfileUrl) return;
    setStatusMessage("Updating LinkedIn fields...");
    const result = await apiClient.importLinkedIn({ contactId: id, profileUrl: form.linkedInProfileUrl });
    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "LinkedIn update failed.");
      return;
    }
    setDetail(result.data);
    setForm(toFormState(result.data));
    setStatusMessage("LinkedIn fields updated.");
  };

  const openHistory = async () => {
    if (!id) return;
    setHistoryOpen(true);
    setHistoryLoading(true);
    const result = await apiClient.getLinkedInHistory(id);
    setHistory(result.ok && result.data ? result.data : []);
    setHistoryLoading(false);
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
    const payload = { ...form, id, status: "Archived" as const };
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
          <p className="text-sm text-muted">ID: {detail.id}</p>
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
          <select className="input" value={form.contactType} onChange={(event) => setForm({ ...form, contactType: event.target.value as ContactType })} disabled={!editing}>
            {typeOptions.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="mb-1 block text-sm text-muted">Status</span>
          <select className="input" value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ContactStatus })} disabled={!editing}>
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
          <input className="input" value={form.referredBy} onChange={(event) => setForm({ ...form, referredBy: event.target.value })} disabled={!editing} />
        </label>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <MethodsEditor
          label="Phone Numbers"
          iconLabel="PHONE"
          items={form.phones}
          disabled={!editing}
          onChange={(index, field, value) => setMethodField("phones", index, field, value)}
          onAdd={() => addMethod("phones")}
        />
        <MethodsEditor
          label="Email Addresses"
          iconLabel="EMAIL"
          items={form.emails}
          disabled={!editing}
          onChange={(index, field, value) => setMethodField("emails", index, field, value)}
          onAdd={() => addMethod("emails")}
        />
        <MethodsEditor
          label="Websites"
          iconLabel="WEB"
          items={form.websites}
          disabled={!editing}
          onChange={(index, field, value) => setMethodField("websites", index, field, value)}
          onAdd={() => addMethod("websites")}
        />
      </div>

      <section className="rounded border border-border bg-surface p-4" aria-label="LinkedIn Data">
        <div className="grid gap-3 md:grid-cols-[120px_1fr]">
          <div>
            {detail.linkedInPictureUrl ? (
              <img
                src={detail.linkedInPictureUrl}
                alt={`${detail.firstName} ${detail.lastName} LinkedIn profile`}
                className="h-24 w-24 rounded object-cover"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded bg-canvas text-sm text-muted">No image</div>
            )}
          </div>
          <div className="space-y-2">
            <label>
              <span className="mb-1 block text-sm text-muted">LinkedIn Profile URL</span>
              <input
                className="input"
                value={form.linkedInProfileUrl}
                onChange={(event) => setForm({ ...form, linkedInProfileUrl: event.target.value })}
                disabled={!editing}
              />
            </label>
            <p>Company: {detail.linkedInCompany || "Not set"}</p>
            <p>Job Title: {detail.linkedInJobTitle || "Not set"}</p>
            <p>Location: {detail.linkedInLocation || "Not set"}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" className="btn" onClick={() => void updateLinkedIn()} disabled={!canEdit || !form.linkedInProfileUrl}>
                Update LinkedIn Fields
              </button>
              <button type="button" className="btn" onClick={() => void openHistory()}>
                View LinkedIn History
              </button>
              {form.linkedInProfileUrl ? (
                <a className="nav-link" href={form.linkedInProfileUrl} target="_blank" rel="noreferrer">
                  Open LinkedIn Profile
                </a>
              ) : null}
            </div>
          </div>
        </div>
      </section>

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
          onClick={() => {
            setForm(toFormState(detail));
            setEditing(false);
            setStatusMessage("Changes canceled.");
          }}
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

      <LinkedInHistoryModal
        open={historyOpen}
        entries={history}
        loading={historyLoading}
        onClose={() => setHistoryOpen(false)}
      />

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
