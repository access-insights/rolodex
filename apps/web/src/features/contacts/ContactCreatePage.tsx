import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, type ContactAttribute, type ContactStatus, type ContactType, type ContactUpsertInput } from "../../lib/apiClient";

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

const normalizePersonName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

export function ContactCreatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Idle");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [pendingPayload, setPendingPayload] = useState<ContactUpsertInput | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; name: string } | null>(null);
  const [referredByInput, setReferredByInput] = useState("");
  const [referredByContactId, setReferredByContactId] = useState("");
  const [referredByMatches, setReferredByMatches] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [referredByLoading, setReferredByLoading] = useState(false);

  useEffect(() => {
    const term = referredByInput.trim();
    if (!term) return;

    const timer = window.setTimeout(() => {
      setReferredByLoading(true);
      apiClient
        .listContacts(term)
        .then((result) => {
          if (!result.ok || !result.data) {
            setReferredByMatches([]);
            return;
          }
          setReferredByMatches(result.data.slice(0, 8).map((contact) => ({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName })));
        })
        .finally(() => setReferredByLoading(false));
    }, 200);

    return () => window.clearTimeout(timer);
  }, [referredByInput]);

  const resolveReferredByContact = async (input: string) => {
    const trimmed = input.trim();
    if (!trimmed) return { status: "empty" as const };

    const result = await apiClient.listContacts(trimmed);
    if (!result.ok || !result.data) {
      return { status: "error" as const, message: result.error?.message || "Unable to validate referred-by contact." };
    }

    const normalized = normalizePersonName(trimmed);
    const exactMatches = result.data.filter((contact) => {
      const firstLast = normalizePersonName(`${contact.firstName} ${contact.lastName}`);
      const lastFirst = normalizePersonName(`${contact.lastName}, ${contact.firstName}`);
      return normalized === firstLast || normalized === lastFirst;
    });

    if (exactMatches.length === 0) return { status: "none" as const };
    if (exactMatches.length > 1) return { status: "ambiguous" as const };

    return { status: "matched" as const, contact: exactMatches[0] };
  };

  const buildPayload = (formData: FormData, referredBy: string, resolvedReferredByContactId: string): ContactUpsertInput => {
    const attributes = attributeOptions.filter((attribute) => formData.get(`attr-${attribute}`) === "on");
    return {
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      company: String(formData.get("company") || ""),
      role: String(formData.get("role") || ""),
      contactType: selectedType as ContactType,
      status: selectedStatus as ContactStatus,
      referredBy: referredBy || undefined,
      referredByContactId: resolvedReferredByContactId || undefined,
      linkedInProfileUrl: String(formData.get("linkedInProfileUrl") || "") || undefined,
      attributes,
      phones: [],
      emails: [],
      websites: []
    };
  };

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Submitting contact...");

    const formData = new FormData(event.currentTarget);
    if (!selectedType || !selectedStatus) {
      setStatus("Type and Status are required.");
      return;
    }

    let resolvedReferredBy = referredByInput.trim();
    let resolvedReferredByContactId = referredByContactId;
    if (resolvedReferredBy && !resolvedReferredByContactId) {
      const resolution = await resolveReferredByContact(resolvedReferredBy);
      if (resolution.status === "none") {
        setStatus("Referred By must match an existing contact.");
        return;
      }
      if (resolution.status === "ambiguous") {
        setStatus("Multiple contacts match Referred By. Please choose one from suggestions.");
        return;
      }
      if (resolution.status === "error") {
        setStatus(resolution.message);
        return;
      }
      if (resolution.status === "matched") {
        resolvedReferredBy = `${resolution.contact.firstName} ${resolution.contact.lastName}`;
        resolvedReferredByContactId = resolution.contact.id;
        setReferredByInput(resolvedReferredBy);
        setReferredByContactId(resolvedReferredByContactId);
      }
    }

    const payload = buildPayload(formData, resolvedReferredBy, resolvedReferredByContactId);
    const result = await apiClient.createContact(payload);

    if (!result.ok || !result.data) {
      if (result.error?.code === "DUPLICATE_CONTACT") {
        const existingId = String(result.meta?.existingContactId || "");
        if (existingId) {
          setPendingPayload(payload);
          setDuplicateInfo({
            id: existingId,
            name: String(result.meta?.existingContactName || "existing contact")
          });
          setStatus("Possible duplicate found.");
          return;
        }
      }
      setStatus(result.error?.message || "Unable to create contact.");
      return;
    }

    setStatus("Contact created.");
    navigate(`/contacts/${result.data.id}`);
  };

  return (
    <section aria-labelledby="new-contact-title" className="max-w-2xl space-y-3">
      <h1 id="new-contact-title" className="text-2xl font-semibold">
        New Contact
      </h1>

      <form onSubmit={onSubmit} className="space-y-3 rounded border border-border bg-surface p-4">
        <div className="grid gap-3 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-muted">First Name</span>
            <input name="firstName" className="input" required />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Last Name</span>
            <input name="lastName" className="input" required />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Company</span>
            <input name="company" className="input" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Role</span>
            <input name="role" className="input" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Type</span>
            <select name="contactType" className="input" value={selectedType} onChange={(event) => setSelectedType(event.target.value)} required>
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

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Status</span>
            <select name="status" className="input" value={selectedStatus} onChange={(event) => setSelectedStatus(event.target.value)} required>
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

          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-muted">Referred By</span>
            <input
              className="input"
              value={referredByInput}
              onChange={(event) => {
                setReferredByInput(event.target.value);
                setReferredByContactId("");
                setReferredByMatches([]);
              }}
              onBlur={() => {
                if (!referredByInput.trim() || referredByContactId) return;
                void resolveReferredByContact(referredByInput).then((resolution) => {
                  if (resolution.status !== "matched") return;
                  setReferredByInput(`${resolution.contact.firstName} ${resolution.contact.lastName}`);
                  setReferredByContactId(resolution.contact.id);
                });
              }}
              role="combobox"
              aria-autocomplete="list"
              aria-expanded={referredByMatches.length > 0}
              aria-controls="create-referred-by-suggestions"
            />
            <div className="mt-2 rounded border border-border bg-canvas p-2">
              {referredByLoading ? <p className="text-xs text-muted">Loading suggestions...</p> : null}
              {!referredByLoading && referredByMatches.length === 0 && referredByInput.trim() ? (
                <p className="text-xs text-muted">No matching contacts.</p>
              ) : null}
              {!referredByLoading && referredByMatches.length > 0 ? (
                <ul id="create-referred-by-suggestions" className="space-y-1" aria-label="Referred by suggestions">
                  {referredByMatches.map((contact) => (
                    <li key={contact.id}>
                      <button
                        type="button"
                        className="nav-link w-full text-left"
                        onClick={() => {
                          setReferredByInput(`${contact.firstName} ${contact.lastName}`);
                          setReferredByContactId(contact.id);
                        }}
                      >
                        {contact.lastName}, {contact.firstName}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </label>
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-muted">LinkedIn Profile URL</span>
          <input name="linkedInProfileUrl" className="input" type="url" placeholder="https://www.linkedin.com/in/example" />
        </label>

        <fieldset className="rounded border border-border p-3">
          <legend className="px-1 text-sm font-semibold">Attributes</legend>
          <div className="mt-2 grid gap-2 md:grid-cols-2">
            {attributeOptions.map((attribute) => (
              <label key={attribute} className="inline-flex items-center gap-2">
                <input type="checkbox" name={`attr-${attribute}`} />
                <span>{attribute}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <button type="submit" className="btn">
          Save
        </button>
      </form>

      <p className="text-sm text-muted" aria-live="polite">
        {status}
      </p>
      {duplicateInfo ? (
        <div className="rounded border border-border bg-surface p-3">
          <p className="text-sm">
            Similar contact found: <strong>{duplicateInfo.name}</strong>
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              className="btn"
              onClick={async () => {
                if (!pendingPayload) return;
                const forced = await apiClient.createContact({ ...pendingPayload, allowDuplicate: true });
                if (!forced.ok || !forced.data) {
                  setStatus(forced.error?.message || "Unable to create contact.");
                  return;
                }
                navigate(`/contacts/${forced.data.id}`);
              }}
            >
              Proceed Anyway
            </button>
            <button type="button" className="btn" onClick={() => navigate(`/contacts/${duplicateInfo.id}`)}>
              Edit Existing
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
