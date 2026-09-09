-- Receipts are committed atomically with the contact mutation.
create unique index if not exists audit_assistant_request_unique
on audit_log (organization_id, actor_subject, (metadata->>'requestId'))
where action = 'assistant.contact.save';
