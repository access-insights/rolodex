-- Prompt 7: structured contact address fields.

alter table contacts
  add column if not exists billing_address_line1 text,
  add column if not exists billing_address_line2 text,
  add column if not exists billing_city text,
  add column if not exists billing_state text,
  add column if not exists billing_zip_code text,
  add column if not exists shipping_address_line1 text,
  add column if not exists shipping_address_line2 text,
  add column if not exists shipping_city text,
  add column if not exists shipping_state text,
  add column if not exists shipping_zip_code text;

update contacts
set
  billing_address_line1 = coalesce(billing_address_line1, billing_address),
  shipping_address_line1 = coalesce(shipping_address_line1, shipping_address)
where billing_address is not null or shipping_address is not null;
