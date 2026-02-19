import { FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  apiClient,
  type ContactAttribute,
  type ContactMethod,
  type ContactStatus,
  type ContactType,
  type ContactUpsertInput
} from "../../lib/apiClient";

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
  "Disability Community",
  "Investor",
  "Adaptive Sports",
  "Accelerator",
  "Governement"
];

const phoneLabelOptions = ["Mobile", "Work", "Home", "Direct", "Assistant", "Other"];
const emailLabelOptions = ["Work", "Personal", "Billing", "Support", "Other"];
const websiteLabelOptions = ["Company", "LinkedIn", "Personal", "Portfolio", "Other"];

const emptyMethod = (): ContactMethod => ({ label: "", value: "" });
const normalizePersonName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");
const contactMatchesPersonTerm = (firstName: string, lastName: string, term: string) => {
  const normalizedTerm = normalizePersonName(term);
  if (!normalizedTerm) return true;

  const firstLast = normalizePersonName(`${firstName} ${lastName}`);
  const lastFirst = normalizePersonName(`${lastName}, ${firstName}`);
  return firstLast.includes(normalizedTerm) || lastFirst.includes(normalizedTerm);
};

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

export function ContactCreatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Idle");
  const [selectedType, setSelectedType] = useState<string>("");
  const [selectedStatus, setSelectedStatus] = useState<string>("");
  const [pendingPayload, setPendingPayload] = useState<ContactUpsertInput | null>(null);
  const [duplicateInfo, setDuplicateInfo] = useState<{ id: string; name: string } | null>(null);
  const [referredByInput, setReferredByInput] = useState("");
  const [referredByContactId, setReferredByContactId] = useState("");
  const [billingAddressLine1, setBillingAddressLine1] = useState("");
  const [billingAddressLine2, setBillingAddressLine2] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingState, setBillingState] = useState("");
  const [billingZipCode, setBillingZipCode] = useState("");
  const [shippingAddressLine1, setShippingAddressLine1] = useState("");
  const [shippingAddressLine2, setShippingAddressLine2] = useState("");
  const [shippingCity, setShippingCity] = useState("");
  const [shippingState, setShippingState] = useState("");
  const [shippingZipCode, setShippingZipCode] = useState("");
  const [shippingSameAsBilling, setShippingSameAsBilling] = useState(false);
  const [phones, setPhones] = useState<ContactMethod[]>([emptyMethod()]);
  const [emails, setEmails] = useState<ContactMethod[]>([emptyMethod()]);
  const [websites, setWebsites] = useState<ContactMethod[]>([emptyMethod()]);
  const [referredByMatches, setReferredByMatches] = useState<Array<{ id: string; firstName: string; lastName: string }>>([]);
  const [referredByLoading, setReferredByLoading] = useState(false);

  useEffect(() => {
    const term = referredByInput.trim();
    if (!term || referredByContactId) return;

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
              .filter((contact) => contactMatchesPersonTerm(contact.firstName, contact.lastName, term))
              .slice(0, 8)
              .map((contact) => ({ id: contact.id, firstName: contact.firstName, lastName: contact.lastName }))
          );
        })
        .finally(() => setReferredByLoading(false));
    }, 200);

    return () => window.clearTimeout(timer);
  }, [referredByInput, referredByContactId]);

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

  const setMethodField = (
    group: "phones" | "emails" | "websites",
    index: number,
    field: "label" | "value",
    value: string
  ) => {
    const setter = group === "phones" ? setPhones : group === "emails" ? setEmails : setWebsites;
    setter((prev) => prev.map((item, itemIndex) => (itemIndex === index ? { ...item, [field]: value } : item)));
  };

  const addMethod = (group: "phones" | "emails" | "websites") => {
    const setter = group === "phones" ? setPhones : group === "emails" ? setEmails : setWebsites;
    setter((prev) => [...prev, emptyMethod()]);
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
      internalContact: String(formData.get("internalContact") || "") || undefined,
      referredBy: referredBy || undefined,
      referredByContactId: resolvedReferredByContactId || undefined,
      linkedInProfileUrl: String(formData.get("linkedInProfileUrl") || "") || undefined,
      billingAddressLine1: billingAddressLine1.trim() || undefined,
      billingAddressLine2: billingAddressLine2.trim() || undefined,
      billingCity: billingCity.trim() || undefined,
      billingState: billingState.trim() || undefined,
      billingZipCode: billingZipCode.trim() || undefined,
      shippingAddressLine1: (shippingSameAsBilling ? billingAddressLine1 : shippingAddressLine1).trim() || undefined,
      shippingAddressLine2: (shippingSameAsBilling ? billingAddressLine2 : shippingAddressLine2).trim() || undefined,
      shippingCity: (shippingSameAsBilling ? billingCity : shippingCity).trim() || undefined,
      shippingState: (shippingSameAsBilling ? billingState : shippingState).trim() || undefined,
      shippingZipCode: (shippingSameAsBilling ? billingZipCode : shippingZipCode).trim() || undefined,
      shippingSameAsBilling,
      attributes,
      phones: phones
        .map((entry) => ({ ...entry, value: formatPhoneNumber(entry.value) }))
        .filter((entry) => entry.value.trim().length > 0),
      emails: emails.filter((entry) => entry.value.trim().length > 0),
      websites: websites.filter((entry) => entry.value.trim().length > 0)
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

    const invalidEmail = emails.find((entry) => entry.value.trim().length > 0 && !entry.value.includes("@"));
    if (invalidEmail) {
      setStatus("Email addresses must include @.");
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
        setReferredByMatches([]);
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

          <label className="block">
            <span className="mb-1 block text-sm text-muted">Internal Contact</span>
            <input name="internalContact" className="input" />
          </label>

          <label className="block">
            <span className="mb-1 block text-sm text-muted">LinkedIn Profile URL</span>
            <input name="linkedInProfileUrl" className="input" type="url" placeholder="https://www.linkedin.com/in/example" />
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
            {!referredByContactId ? (
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
                            setReferredByMatches([]);
                          }}
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
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <section className="rounded border border-border p-3" aria-label="Phone Numbers">
            <h3 className="text-sm font-semibold">Phone Numbers</h3>
            <div className="mt-2 space-y-2">
              {phones.map((item, index) => (
                <div key={`phone-${index}`} className="grid gap-2">
                  <select
                    className="input"
                    value={item.label ?? ""}
                    onChange={(event) => setMethodField("phones", index, "label", event.target.value)}
                    aria-label={`Phone label ${index + 1}`}
                  >
                    <option value="">Select label</option>
                    {phoneLabelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="tel"
                    inputMode="tel"
                    placeholder="Value"
                    value={item.value}
                    onChange={(event) => setMethodField("phones", index, "value", event.target.value)}
                    aria-label={`Phone value ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="nav-link mt-2" onClick={() => addMethod("phones")}>
              Add Phone Number
            </button>
          </section>

          <section className="rounded border border-border p-3" aria-label="Email Addresses">
            <h3 className="text-sm font-semibold">Email Addresses</h3>
            <div className="mt-2 space-y-2">
              {emails.map((item, index) => (
                <div key={`email-${index}`} className="grid gap-2">
                  <select
                    className="input"
                    value={item.label ?? ""}
                    onChange={(event) => setMethodField("emails", index, "label", event.target.value)}
                    aria-label={`Email label ${index + 1}`}
                  >
                    <option value="">Select label</option>
                    {emailLabelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="email"
                    inputMode="email"
                    placeholder="Value"
                    value={item.value}
                    onChange={(event) => setMethodField("emails", index, "value", event.target.value)}
                    aria-label={`Email value ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="nav-link mt-2" onClick={() => addMethod("emails")}>
              Add Email Address
            </button>
          </section>

          <section className="rounded border border-border p-3" aria-label="Websites">
            <h3 className="text-sm font-semibold">Websites</h3>
            <div className="mt-2 space-y-2">
              {websites.map((item, index) => (
                <div key={`website-${index}`} className="grid gap-2">
                  <select
                    className="input"
                    value={item.label ?? ""}
                    onChange={(event) => setMethodField("websites", index, "label", event.target.value)}
                    aria-label={`Website label ${index + 1}`}
                  >
                    <option value="">Select label</option>
                    {websiteLabelOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                  <input
                    className="input"
                    type="url"
                    inputMode="url"
                    placeholder="Value"
                    value={item.value}
                    onChange={(event) => setMethodField("websites", index, "value", event.target.value)}
                    aria-label={`Website value ${index + 1}`}
                  />
                </div>
              ))}
            </div>
            <button type="button" className="nav-link mt-2" onClick={() => addMethod("websites")}>
              Add Website
            </button>
          </section>
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <p className="text-sm font-semibold md:col-span-2">Billing Address</p>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-muted">Address Line 1</span>
            <input
              className="input"
              value={billingAddressLine1}
              onChange={(event) => {
                const next = event.target.value;
                setBillingAddressLine1(next);
                if (shippingSameAsBilling) setShippingAddressLine1(next);
              }}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-muted">Address Line 2</span>
            <input
              className="input"
              value={billingAddressLine2}
              onChange={(event) => {
                const next = event.target.value;
                setBillingAddressLine2(next);
                if (shippingSameAsBilling) setShippingAddressLine2(next);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">City</span>
            <input
              className="input"
              value={billingCity}
              onChange={(event) => {
                const next = event.target.value;
                setBillingCity(next);
                if (shippingSameAsBilling) setShippingCity(next);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">State</span>
            <input
              className="input"
              value={billingState}
              onChange={(event) => {
                const next = event.target.value;
                setBillingState(next);
                if (shippingSameAsBilling) setShippingState(next);
              }}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Zip Code</span>
            <input
              className="input"
              value={billingZipCode}
              onChange={(event) => {
                const next = event.target.value;
                setBillingZipCode(next);
                if (shippingSameAsBilling) setShippingZipCode(next);
              }}
            />
          </label>
          <label className="inline-flex items-center gap-2 md:col-span-2">
            <input
              type="checkbox"
              checked={shippingSameAsBilling}
              onChange={(event) => {
                const checked = event.target.checked;
                setShippingSameAsBilling(checked);
                if (checked) {
                  setShippingAddressLine1(billingAddressLine1);
                  setShippingAddressLine2(billingAddressLine2);
                  setShippingCity(billingCity);
                  setShippingState(billingState);
                  setShippingZipCode(billingZipCode);
                }
              }}
            />
            <span>Shipping address is the same as billing</span>
          </label>
          <p className="text-sm font-semibold md:col-span-2">Shipping Address</p>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-muted">Address Line 1</span>
            <input
              className="input"
              value={shippingSameAsBilling ? billingAddressLine1 : shippingAddressLine1}
              onChange={(event) => setShippingAddressLine1(event.target.value)}
              disabled={shippingSameAsBilling}
            />
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm text-muted">Address Line 2</span>
            <input
              className="input"
              value={shippingSameAsBilling ? billingAddressLine2 : shippingAddressLine2}
              onChange={(event) => setShippingAddressLine2(event.target.value)}
              disabled={shippingSameAsBilling}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">City</span>
            <input
              className="input"
              value={shippingSameAsBilling ? billingCity : shippingCity}
              onChange={(event) => setShippingCity(event.target.value)}
              disabled={shippingSameAsBilling}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">State</span>
            <input
              className="input"
              value={shippingSameAsBilling ? billingState : shippingState}
              onChange={(event) => setShippingState(event.target.value)}
              disabled={shippingSameAsBilling}
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Zip Code</span>
            <input
              className="input"
              value={shippingSameAsBilling ? billingZipCode : shippingZipCode}
              onChange={(event) => setShippingZipCode(event.target.value)}
              disabled={shippingSameAsBilling}
            />
          </label>
        </div>

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
