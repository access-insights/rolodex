-- Prompt 5: contact attributes and indexed search coverage.

create extension if not exists pg_trgm;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'contact_attribute_enum') then
    create type contact_attribute_enum as enum (
      'Academia',
      'Accessible Education',
      'Startup',
      'Not for Profit',
      'AgeTech',
      'Robotics',
      'AI Solutions',
      'Consumer Products',
      'Disability Services',
      'Disability Community'
    );
  end if;
end
$$;

alter table contacts
  add column if not exists attributes contact_attribute_enum[] not null default '{}'::contact_attribute_enum[];

create index if not exists contacts_attributes_idx on contacts using gin (attributes);

create index if not exists contacts_search_vector_idx
on contacts
using gin (
  to_tsvector(
    'simple',
    coalesce(first_name, '') || ' ' ||
    coalesce(last_name, '') || ' ' ||
    coalesce(organization, '') || ' ' ||
    coalesce(role, '') || ' ' ||
    coalesce(internal_contact, '') || ' ' ||
    coalesce(referred_by, '') || ' ' ||
    coalesce(linkedin_profile_url, '') || ' ' ||
    coalesce(linkedin_company, '') || ' ' ||
    coalesce(linkedin_job_title, '') || ' ' ||
    coalesce(linkedin_location, '') || ' ' ||
    coalesce(array_to_string(attributes::text[], ' '), '')
  )
);

create index if not exists contact_phone_numbers_value_trgm_idx
on contact_phone_numbers
using gin (phone_number gin_trgm_ops);

create index if not exists contact_phone_numbers_label_trgm_idx
on contact_phone_numbers
using gin (coalesce(label, '') gin_trgm_ops);

create index if not exists contact_emails_value_trgm_idx
on contact_emails
using gin (email gin_trgm_ops);

create index if not exists contact_emails_label_trgm_idx
on contact_emails
using gin (coalesce(label, '') gin_trgm_ops);

create index if not exists contact_websites_value_trgm_idx
on contact_websites
using gin (url gin_trgm_ops);

create index if not exists contact_websites_label_trgm_idx
on contact_websites
using gin (coalesce(label, '') gin_trgm_ops);

create index if not exists contact_comments_body_trgm_idx
on contact_comments
using gin (body gin_trgm_ops)
where deleted_at is null;
