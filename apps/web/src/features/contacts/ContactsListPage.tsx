import { ChangeEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { apiClient, type ContactListItem } from "../../lib/apiClient";
import { useAuth } from "../auth/AuthContext";

type FilterColumn = "Type" | "Status" | "Company" | "Attributes";

export function ContactsListPage() {
  const { user } = useAuth();

  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [activeSearch, setActiveSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState<FilterColumn>("Type");
  const [filterValue, setFilterValue] = useState("All");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading contacts...");

  const isAdmin = user?.role === "admin";

  const loadContacts = async (searchTerm = "") => {
    setStatusMessage("Loading contacts...");
    const result = await apiClient.listContacts(searchTerm);
    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "Unable to load contacts.");
      setContacts([]);
      return;
    }

    setContacts(result.data);
    setStatusMessage(`Loaded ${result.data.length} contacts.`);
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void loadContacts(activeSearch);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [activeSearch]);

  const filterValues = useMemo(() => {
    const unique = new Set<string>();
    if (filterColumn === "Type") {
      contacts.forEach((contact) => unique.add(contact.contactType));
    }
    if (filterColumn === "Status") {
      contacts.forEach((contact) => unique.add(contact.status));
    }
    if (filterColumn === "Company") {
      contacts.forEach((contact) => unique.add(contact.company || "Unknown"));
    }
    if (filterColumn === "Attributes") {
      contacts.forEach((contact) => {
        if (contact.attributes.length === 0) {
          unique.add("None");
          return;
        }
        contact.attributes.forEach((attribute) => unique.add(attribute));
      });
    }
    return ["All", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [contacts, filterColumn]);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((contact) => (includeArchived ? true : contact.status !== "Archived"))
      .filter((contact) => {
        if (filterValue === "All") return true;
        if (filterColumn === "Type") return contact.contactType === filterValue;
        if (filterColumn === "Status") return contact.status === filterValue;
        if (filterColumn === "Attributes") {
          if (filterValue === "None") return contact.attributes.length === 0;
          return contact.attributes.includes(filterValue as ContactListItem["attributes"][number]);
        }
        return (contact.company || "Unknown") === filterValue;
      })
      .sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName);
        if (last !== 0) return last;
        return a.firstName.localeCompare(b.firstName);
      });
  }, [contacts, filterColumn, filterValue, includeArchived]);

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;

    const result = await apiClient.deleteContact(confirmDeleteId);
    setConfirmDeleteId(null);
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Delete failed.");
      return;
    }

    setStatusMessage("Contact deleted.");
    await loadContacts(activeSearch);
  };

  return (
    <section aria-labelledby="contacts-title" className="space-y-4">
      <header className="contacts-page-header">
        <h1 id="contacts-title" className="text-2xl font-semibold">
          Contacts
        </h1>
      </header>

      <div className="grid gap-4 rounded border border-border bg-surface p-4">
        <section aria-label="Search and filters" className="space-y-2">
          <form
            className="space-y-2"
            onSubmit={(event) => {
              event.preventDefault();
              setActiveSearch(searchInput.trim());
            }}
          >
            <label className="block" aria-label="Search contacts">
              <div className="contacts-search-row contacts-search-inline">
                <input
                  value={searchInput}
                  onChange={(event) => setSearchInput(event.target.value)}
                  className="input contacts-search-input"
                  placeholder="Search contacts"
                  aria-label="Search contacts"
                />
                <button type="submit" className="contacts-search-icon-btn" aria-label="Run search">
                  <svg
                    aria-hidden="true"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                </button>
              </div>
            </label>
          </form>

          <div className="grid gap-2 md:grid-cols-2">
            <label>
              <span className="mb-1 block text-sm text-muted">Filter column</span>
              <select
                className="input"
                value={filterColumn}
                onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                  setFilterColumn(event.target.value as FilterColumn);
                  setFilterValue("All");
                }}
              >
                <option value="Type">Type</option>
                <option value="Status">Status</option>
                <option value="Company">Company</option>
                <option value="Attributes">Attributes</option>
              </select>
            </label>
            <label>
              <span className="mb-1 block text-sm text-muted">Filter value</span>
              <select className="input" value={filterValue} onChange={(event) => setFilterValue(event.target.value)}>
                {filterValues.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={includeArchived}
              onChange={(event) => {
                setIncludeArchived(event.target.checked);
              }}
            />
            <span>Include archived</span>
          </label>
        </section>

      </div>

      <div className="contacts-results-layout">
        <div className="overflow-x-auto rounded border border-border bg-surface">
          <table className="min-w-full border-collapse">
            <caption className="sr-only">Contact summary table</caption>
            <thead>
              <tr className="border-b border-border text-left">
                <th scope="col" className="px-3 py-2">
                  Last Name
                </th>
                <th scope="col" className="px-3 py-2">
                  First Name
                </th>
                <th scope="col" className="px-3 py-2">
                  Company
                </th>
                <th scope="col" className="px-3 py-2">
                  Type
                </th>
                <th scope="col" className="px-3 py-2">
                  Status
                </th>
                <th scope="col" className="px-3 py-2">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {filteredContacts.length === 0 ? (
                <tr>
                  <td className="px-3 py-2 text-muted" colSpan={6}>
                    No contacts found.
                  </td>
                </tr>
              ) : (
                filteredContacts.map((contact) => (
                  <tr key={contact.id} className="border-b border-border">
                    <td className="px-3 py-2">{contact.lastName}</td>
                    <td className="px-3 py-2">{contact.firstName}</td>
                    <td className="px-3 py-2">{contact.company || "Unknown"}</td>
                    <td className="px-3 py-2">{contact.contactType}</td>
                    <td className="px-3 py-2">{contact.status}</td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-2">
                        <Link to={`/contacts/${contact.id}`} className="btn">
                          View
                        </Link>
                        {isAdmin ? (
                          <button type="button" className="btn" onClick={() => setConfirmDeleteId(contact.id)}>
                            Delete
                          </button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <p aria-live="polite" className="text-sm text-muted">
        {statusMessage}
      </p>

      <Modal open={Boolean(confirmDeleteId)} onClose={() => setConfirmDeleteId(null)} title="Delete Contact" labelledById="delete-contact-confirm-title">
        <p>Delete this contact?</p>
        <div className="mt-4 flex gap-2">
          <button type="button" className="btn" onClick={() => void confirmDelete()}>
            Confirm Delete
          </button>
          <button type="button" className="btn" onClick={() => setConfirmDeleteId(null)}>
            Cancel
          </button>
        </div>
      </Modal>
    </section>
  );
}
