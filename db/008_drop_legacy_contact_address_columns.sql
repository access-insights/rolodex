-- Prompt 8: remove legacy free-text address columns.

alter table contacts
  drop column if exists billing_address,
  drop column if exists shipping_address;
