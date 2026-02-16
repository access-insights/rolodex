import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiClient, type ContactAttribute, type ContactStatus, type ContactType } from "../../lib/apiClient";

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

export function ContactCreatePage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<string>("Idle");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Submitting contact...");

    const formData = new FormData(event.currentTarget);
    const contactType = String(formData.get("contactType") || "");
    const contactStatus = String(formData.get("status") || "");

    if (!contactType || !contactStatus) {
      setStatus("Type and Status are required.");
      return;
    }

    const attributes = attributeOptions.filter((attribute) => formData.get(`attr-${attribute}`) === "on");
    const result = await apiClient.createContact({
      firstName: String(formData.get("firstName") || ""),
      lastName: String(formData.get("lastName") || ""),
      company: String(formData.get("company") || ""),
      role: String(formData.get("role") || ""),
      contactType: contactType as ContactType,
      status: contactStatus as ContactStatus,
      linkedInProfileUrl: String(formData.get("linkedInProfileUrl") || "") || undefined,
      attributes,
      phones: [],
      emails: [],
      websites: []
    });

    if (!result.ok || !result.data) {
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
            <select name="contactType" className="input" defaultValue="" required>
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
            <select name="status" className="input" defaultValue="" required>
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
    </section>
  );
}
