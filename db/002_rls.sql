-- Prompt 2: row-level security and request-context helpers for Rolodex.

create or replace function current_org_id()
returns uuid
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.org_id', true), '')::uuid,
    nullif(current_setting('app.current_org_id', true), '')::uuid
  );
$$;

create or replace function current_app_role()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.role', true), ''),
    nullif(current_setting('app.current_role', true), '')
  );
$$;

create or replace function current_sub()
returns text
language sql
stable
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    nullif(current_setting('app.current_sub', true), '')
  );
$$;

create or replace function is_authenticated()
returns boolean
language sql
stable
as $$
  select current_sub() is not null;
$$;

alter table organizations enable row level security;
alter table users enable row level security;
alter table contacts enable row level security;
alter table audit_log enable row level security;

-- organizations
create policy organizations_select_own_org
on organizations
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and id = current_org_id()
);

create policy organizations_update_own_org_admin
on organizations
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and id = current_org_id()
);

-- users
create policy users_select_org
on users
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and organization_id = current_org_id()
);

create policy users_insert_admin
on users
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

create policy users_update_admin
on users
for update
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
)
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

create policy users_delete_admin
on users
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- contacts
create policy contacts_select_org
on contacts
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy contacts_insert_admin_creator
on contacts
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);

create policy contacts_update_admin_creator
on contacts
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

create policy contacts_delete_admin
on contacts
for delete
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() = 'admin'
  and organization_id = current_org_id()
);

-- audit_log
create policy audit_log_insert_org
on audit_log
for insert
with check (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator', 'participant')
  and organization_id = current_org_id()
);

create policy audit_log_select_admin_creator
on audit_log
for select
using (
  is_authenticated()
  and current_org_id() is not null
  and current_app_role() in ('admin', 'creator')
  and organization_id = current_org_id()
);
