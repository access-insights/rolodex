-- Prompt 2: schema initialization for Rolodex.

create extension if not exists pgcrypto;

create type contact_type_enum as enum ('Advisor', 'Client', 'Funder', 'Partner');
create type contact_status_enum as enum ('Active', 'Prospect');
create type user_role_enum as enum ('admin', 'creator', 'participant');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table users (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  subject text not null unique,
  email text,
  display_name text,
  role user_role_enum not null default 'participant',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index users_organization_id_idx on users (organization_id);

create table contacts (
  unique_id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  first_name text not null,
  last_name text not null,
  organization text,
  role text,
  internal_contact text,
  referred_by text,
  contact_type contact_type_enum not null,
  status contact_status_enum not null default 'Prospect',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references users(id),
  updated_by uuid references users(id)
);

create index contacts_organization_id_idx on contacts (organization_id);
create index contacts_last_name_idx on contacts (last_name);
create index contacts_contact_type_idx on contacts (contact_type);
create index contacts_status_idx on contacts (status);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations(id) on delete cascade,
  actor_user_id uuid references users(id),
  actor_subject text,
  action text not null,
  entity_type text,
  entity_id uuid,
  ip text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_organization_id_idx on audit_log (organization_id);
create index audit_log_created_at_idx on audit_log (created_at);
create index audit_log_entity_lookup_idx on audit_log (entity_type, entity_id);

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_set_updated_at
before update on users
for each row
execute function set_updated_at();

create trigger contacts_set_updated_at
before update on contacts
for each row
execute function set_updated_at();
