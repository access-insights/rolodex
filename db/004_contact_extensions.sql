-- Prompt 4: contact model extensions, related tables, and RLS policies.

alter type contact_type_enum add value if not exists 'General';
alter type contact_status_enum add value if not exists 'Inactive';
alter type contact_status_enum add value if not exists 'Archived';

alter table contacts
  add column if not exists linkedin_profile_url text,
  add column if not exists linkedin_picture_url text,
  add column if not exists linkedin_company text,
  add column if not exists linkedin_job_title text,
  add column if not exists linkedin_location text,
  add column if not exists referred_by_contact_id uuid references contacts(unique_id) on delete set null;

create index if not exists contacts_referred_by_contact_id_idx on contacts (referred_by_contact_id);

create table if not exists contact_phone_numbers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(unique_id) on delete cascade,
  label text,
  phone_number text not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists contact_phone_numbers_org_idx on contact_phone_numbers (organization_id);
create index if not exists contact_phone_numbers_contact_idx on contact_phone_numbers (contact_id);

create table if not exists contact_emails (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(unique_id) on delete cascade,
  label text,
  email text not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists contact_emails_org_idx on contact_emails (organization_id);
create index if not exists contact_emails_contact_idx on contact_emails (contact_id);

create table if not exists contact_websites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(unique_id) on delete cascade,
  label text,
  url text not null,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists contact_websites_org_idx on contact_websites (organization_id);
create index if not exists contact_websites_contact_idx on contact_websites (contact_id);

create table if not exists linkedin_history (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(unique_id) on delete cascade,
  snapshot jsonb not null,
  captured_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists linkedin_history_org_idx on linkedin_history (organization_id);
create index if not exists linkedin_history_contact_idx on linkedin_history (contact_id);
create index if not exists linkedin_history_captured_at_idx on linkedin_history (captured_at desc);

create table if not exists contact_comments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  contact_id uuid not null references contacts(unique_id) on delete cascade,
  body text not null,
  archived boolean not null default false,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references users(id)
);

create index if not exists contact_comments_org_idx on contact_comments (organization_id);
create index if not exists contact_comments_contact_idx on contact_comments (contact_id);
create index if not exists contact_comments_created_at_idx on contact_comments (created_at desc);

alter table contact_phone_numbers enable row level security;
alter table contact_emails enable row level security;
alter table contact_websites enable row level security;
alter table linkedin_history enable row level security;
alter table contact_comments enable row level security;

-- contact_phone_numbers
create policy contact_phone_numbers_select_org
on contact_phone_numbers
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contact_phone_numbers_insert_admin_creator
on contact_phone_numbers
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_phone_numbers_update_admin_creator
on contact_phone_numbers
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_phone_numbers_delete_admin
on contact_phone_numbers
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- contact_emails
create policy contact_emails_select_org
on contact_emails
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contact_emails_insert_admin_creator
on contact_emails
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_emails_update_admin_creator
on contact_emails
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_emails_delete_admin
on contact_emails
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- contact_websites
create policy contact_websites_select_org
on contact_websites
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contact_websites_insert_admin_creator
on contact_websites
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_websites_update_admin_creator
on contact_websites
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_websites_delete_admin
on contact_websites
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- linkedin_history
create policy linkedin_history_select_org
on linkedin_history
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy linkedin_history_insert_admin_creator
on linkedin_history
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy linkedin_history_delete_admin
on linkedin_history
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- contact_comments
create policy contact_comments_select_org
on contact_comments
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contact_comments_insert_all_roles
on contact_comments
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contact_comments_update_admin_creator
on contact_comments
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contact_comments_delete_admin
on contact_comments
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);
