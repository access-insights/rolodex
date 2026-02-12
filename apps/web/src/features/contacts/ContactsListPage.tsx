import { Link } from "react-router-dom";
import { useEffect, useState } from "react";
import { apiClient, type ContactListItem } from "../../lib/apiClient";

export function ContactsListPage() {
  const [contacts, setContacts] = useState<ContactListItem[]>([]);

  useEffect(() => {
    apiClient.listEntities().then((result) => {
      if (result.ok && result.data) {
        setContacts(result.data);
      }
    }).catch(() => {
      setContacts([]);
    });
  }, []);

  return (
    <section aria-labelledby="contacts-title">
      <div className="flex items-center justify-between">
        <h1 id="contacts-title" className="text-2xl font-semibold">
          Contacts
        </h1>
        <Link to="/contacts/new" className="btn">
          Add placeholder contact
        </Link>
      </div>
      <p className="mt-2 text-muted">Placeholder list endpoint wired to `entities/list`.</p>
      <ul className="mt-4 space-y-2">
        {contacts.map((contact) => (
          <li key={contact.id} className="rounded border border-border bg-surface p-3">
            {contact.firstName} {contact.lastName}
          </li>
        ))}
      </ul>
    </section>
  );
}
