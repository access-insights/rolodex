import { FormEvent, useState } from "react";
import { apiClient } from "../../lib/apiClient";

export function ContactCreatePage() {
  const [status, setStatus] = useState<string>("Idle");

  const onSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Submitting placeholder contact...");

    const formData = new FormData(event.currentTarget);
    await apiClient.createEntity({
      firstName: String(formData.get("firstName") || "Placeholder"),
      lastName: String(formData.get("lastName") || "Contact"),
      organization: "Access Insights",
      role: "Unknown",
      contactType: "Client",
      status: "Prospect"
    });

    setStatus("Placeholder create action submitted.");
  };

  return (
    <section aria-labelledby="new-contact-title" className="max-w-xl">
      <h1 id="new-contact-title" className="text-2xl font-semibold">
        New Contact
      </h1>
      <p className="mt-2 text-muted">This form submits placeholder data to `entities/create`.</p>

      <form onSubmit={onSubmit} className="mt-4 space-y-3 rounded border border-border bg-surface p-4">
        <label className="block">
          <span className="mb-1 block text-sm text-muted">First Name</span>
          <input name="firstName" className="input" required />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm text-muted">Last Name</span>
          <input name="lastName" className="input" required />
        </label>

        <button type="submit" className="btn">
          Save placeholder
        </button>
      </form>

      <p className="mt-3 text-sm text-muted" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
