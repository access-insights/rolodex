import { ChangeEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Modal } from "../../components/Modal";
import { apiClient, type ContactListItem } from "../../lib/apiClient";
import { useAuth } from "../auth/AuthContext";

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

type FilterColumn = "Type" | "Status" | "Company";

export function ContactsListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const csvInputRef = useRef<HTMLInputElement | null>(null);
  const importMenuRef = useRef<HTMLDivElement | null>(null);

  const [contacts, setContacts] = useState<ContactListItem[]>([]);
  const [search, setSearch] = useState("");
  const [filterColumn, setFilterColumn] = useState<FilterColumn>("Type");
  const [filterValue, setFilterValue] = useState("All");
  const [includeArchived, setIncludeArchived] = useState(false);

  const [linkedinOpen, setLinkedinOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [importMenuOpen, setImportMenuOpen] = useState(false);
  const [linkedInUrl, setLinkedInUrl] = useState("");
  const [linkedInDuplicate, setLinkedInDuplicate] = useState<{ id: string; name: string } | null>(null);

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState("Loading contacts...");

  const isAdmin = user?.role === "admin";

  const loadContacts = async (searchTerm = "") => {
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
      void loadContacts(search);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!importMenuOpen) return;

    const onWindowMouseDown = (event: MouseEvent) => {
      if (!importMenuRef.current?.contains(event.target as Node)) {
        setImportMenuOpen(false);
      }
    };

    window.addEventListener("mousedown", onWindowMouseDown);
    return () => window.removeEventListener("mousedown", onWindowMouseDown);
  }, [importMenuOpen]);

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
    return ["All", ...Array.from(unique).sort((a, b) => a.localeCompare(b))];
  }, [contacts, filterColumn]);

  const filteredContacts = useMemo(() => {
    return contacts
      .filter((contact) => (includeArchived ? true : contact.status !== "Archived"))
      .filter((contact) => {
        if (filterValue === "All") return true;
        if (filterColumn === "Type") return contact.contactType === filterValue;
        if (filterColumn === "Status") return contact.status === filterValue;
        return (contact.company || "Unknown") === filterValue;
      })
      .sort((a, b) => {
        const last = a.lastName.localeCompare(b.lastName);
        if (last !== 0) return last;
        return a.firstName.localeCompare(b.firstName);
      });
  }, [contacts, filterColumn, filterValue, includeArchived]);

  const groupedByLetter = useMemo(() => {
    const groups = new Map<string, ContactListItem[]>();
    letters.forEach((letter) => groups.set(letter, []));

    for (const contact of filteredContacts) {
      const first = contact.lastName.charAt(0).toUpperCase();
      const key = letters.includes(first) ? first : "A";
      groups.get(key)?.push(contact);
    }

    return groups;
  }, [filteredContacts]);

  const submitLinkedInImport = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatusMessage("Importing LinkedIn profile...");

    const result = await apiClient.importLinkedIn({
      profileUrl: linkedInUrl
    });

    if (!result.ok || !result.data) {
      if (result.error?.code === "DUPLICATE_CONTACT") {
        const existingId = String(result.meta?.existingContactId || "");
        if (existingId) {
          setLinkedInDuplicate({
            id: existingId,
            name: String(result.meta?.existingContactName || "existing contact")
          });
          return;
        }
      }
      setStatusMessage(result.error?.message || "LinkedIn import failed.");
      return;
    }

    setLinkedinOpen(false);
    setImportMenuOpen(false);
    setLinkedInUrl("");
    setLinkedInDuplicate(null);
    setStatusMessage("LinkedIn import complete. Opening new contact...");
    await loadContacts();
    navigate(`/contacts/${result.data.id}?edit=1&new=1`);
  };

  const submitCsvImport = async () => {
    const file = csvInputRef.current?.files?.[0];
    if (!file) {
      setStatusMessage("Select a CSV file first.");
      return;
    }

    setStatusMessage("Importing CSV...");
    const csvContent = await file.text();
    const result = await apiClient.importCsv(csvContent);

    if (!result.ok || !result.data) {
      setStatusMessage(result.error?.message || "CSV import failed.");
      return;
    }

    setCsvOpen(false);
    if (csvInputRef.current) {
      csvInputRef.current.value = "";
    }
    setStatusMessage(`CSV import complete. Inserted ${result.data.insertedCount} contact(s).`);
    await loadContacts();
  };

  const confirmDelete = async () => {
    if (!confirmDeleteId) return;

    const result = await apiClient.deleteContact(confirmDeleteId);
    setConfirmDeleteId(null);
    if (!result.ok) {
      setStatusMessage(result.error?.message || "Delete failed.");
      return;
    }

    setStatusMessage("Contact deleted.");
    await loadContacts();
  };

  return (
    <section aria-labelledby="contacts-title" className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 id="contacts-title" className="text-2xl font-semibold">
          Contacts
        </h1>
        <div
          className="relative"
          ref={importMenuRef}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
              setImportMenuOpen(false);
            }
          }}
        >
          <button type="button" className="btn" onClick={() => setImportMenuOpen((open) => !open)} aria-expanded={importMenuOpen} aria-haspopup="menu">
            Import
          </button>
          {importMenuOpen ? (
            <div className="absolute right-0 z-10 mt-2 w-48 rounded border border-border bg-surface p-2 shadow-lg" role="menu">
              <button
                type="button"
                className="nav-link w-full text-left"
                onClick={() => {
                  setLinkedinOpen(true);
                  setImportMenuOpen(false);
                }}
              >
                Import from LinkedIn
              </button>
              <button
                type="button"
                className="nav-link mt-1 w-full text-left"
                onClick={() => {
                  setCsvOpen(true);
                  setImportMenuOpen(false);
                }}
              >
                Import from CSV
              </button>
            </div>
          ) : null}
        </div>
      </header>

      <div className="grid gap-4 rounded border border-border bg-surface p-4 lg:grid-cols-[1.5fr_1fr_1fr]">
        <section aria-label="Search and filters" className="space-y-2">
          <label className="block">
            <span className="mb-1 block text-sm text-muted">Search</span>
            <input value={search} onChange={(event) => setSearch(event.target.value)} className="input" placeholder="Search" />
          </label>

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
            <input type="checkbox" checked={includeArchived} onChange={(event) => setIncludeArchived(event.target.checked)} />
            <span>Include archived</span>
          </label>
        </section>

        <nav aria-label="Alphabet navigation" className="lg:col-span-2">
          <p className="mb-2 text-sm text-muted">A to Z</p>
          <ul className="flex flex-wrap gap-1">
            {letters.map((letter) => (
              <li key={letter}>
                <a href={`#letter-${letter}`} className="nav-link" aria-label={`Jump to contacts last name starting with ${letter}`}>
                  {letter}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>

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
          {letters.map((letter) => {
            const rows = groupedByLetter.get(letter) || [];
            return (
              <tbody key={letter} id={`letter-${letter}`}>
                <tr className="border-y border-border bg-canvas">
                  <th className="px-3 py-2 text-left" colSpan={6} scope="rowgroup">
                    {letter}
                  </th>
                </tr>
                {rows.length === 0 ? (
                  <tr>
                    <td className="px-3 py-2 text-muted" colSpan={6}>
                      No contacts in this section.
                    </td>
                  </tr>
                ) : (
                  rows.map((contact) => (
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
            );
          })}
        </table>
      </div>

      <p aria-live="polite" className="text-sm text-muted">
        {statusMessage}
      </p>

      <Modal open={linkedinOpen} onClose={() => setLinkedinOpen(false)} title="Import from LinkedIn" labelledById="import-linkedin-title">
        <form className="space-y-3" onSubmit={(event) => void submitLinkedInImport(event)}>
          <label className="block">
            <span className="mb-1 block text-sm text-muted">LinkedIn profile URL</span>
            <input
              className="input"
              type="url"
              required
              value={linkedInUrl}
              onChange={(event) => setLinkedInUrl(event.target.value)}
              placeholder="https://www.linkedin.com/in/example"
            />
          </label>
          <button type="submit" className="btn">
            Add New Contact
          </button>
        </form>
      </Modal>

      <Modal open={Boolean(linkedInDuplicate)} onClose={() => setLinkedInDuplicate(null)} title="Possible Duplicate Found" labelledById="linkedin-duplicate-title">
        <p>
          A similar contact already exists: <strong>{linkedInDuplicate?.name}</strong>.
        </p>
        <div className="mt-4 flex gap-2">
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const result = await apiClient.importLinkedIn({ profileUrl: linkedInUrl, allowDuplicate: true });
              if (!result.ok || !result.data) {
                setStatusMessage(result.error?.message || "LinkedIn import failed.");
                return;
              }
              setLinkedInDuplicate(null);
              setLinkedinOpen(false);
              setLinkedInUrl("");
              setStatusMessage("LinkedIn import complete. Opening new contact...");
              await loadContacts();
              navigate(`/contacts/${result.data.id}?edit=1&new=1`);
            }}
          >
            Proceed Anyway
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => {
              if (linkedInDuplicate?.id) {
                navigate(`/contacts/${linkedInDuplicate.id}`);
              }
              setLinkedInDuplicate(null);
              setLinkedinOpen(false);
            }}
          >
            Edit Existing
          </button>
        </div>
      </Modal>

      <Modal open={csvOpen} onClose={() => setCsvOpen(false)} title="Import from CSV" labelledById="import-csv-title">
        <div className="space-y-3">
          <label className="block">
            <span className="mb-1 block text-sm text-muted">CSV file</span>
            <input ref={csvInputRef} className="input" type="file" accept=".csv,text/csv" />
          </label>
          <button type="button" className="btn" onClick={() => void submitCsvImport()}>
            Upload
          </button>
        </div>
      </Modal>

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
