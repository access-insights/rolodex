-- Prompt 6: contact address fields.

alter table contacts
  add column if not exists billing_address text,
  add column if not exists shipping_address text,
  add column if not exists shipping_same_as_billing boolean not null default false;
