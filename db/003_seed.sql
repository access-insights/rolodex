-- Prompt 2: deterministic seed data for local development and tests.

insert into organizations (id, name, created_at)
values
  ('11111111-1111-1111-1111-111111111111', 'Access Insights (Sample)', now())
on conflict (id) do update
set name = excluded.name;

insert into users (id, organization_id, subject, email, display_name, role)
values
  (
    '22222222-2222-2222-2222-222222222221',
    '11111111-1111-1111-1111-111111111111',
    'azure|access-insights-admin-sub',
    'admin.sample@accessinsights.org',
    'Alex Admin',
    'admin'
  ),
  (
    '22222222-2222-2222-2222-222222222222',
    '11111111-1111-1111-1111-111111111111',
    'azure|access-insights-creator-sub',
    'creator.sample@accessinsights.org',
    'Casey Creator',
    'creator'
  ),
  (
    '22222222-2222-2222-2222-222222222223',
    '11111111-1111-1111-1111-111111111111',
    'azure|access-insights-participant-sub',
    'participant.sample@accessinsights.org',
    'Parker Participant',
    'participant'
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  subject = excluded.subject,
  email = excluded.email,
  display_name = excluded.display_name,
  role = excluded.role;

insert into contacts (
  unique_id,
  organization_id,
  first_name,
  last_name,
  organization,
  role,
  internal_contact,
  referred_by,
  contact_type,
  status,
  created_by,
  updated_by
)
values
  (
    '33333333-3333-3333-3333-333333333331',
    '11111111-1111-1111-1111-111111111111',
    'Jordan',
    'Price',
    'Bright Path Advisors',
    'Lead Advisor',
    'Alex Admin',
    'Board Introduction',
    'Advisor',
    'Active',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  ),
  (
    '33333333-3333-3333-3333-333333333332',
    '11111111-1111-1111-1111-111111111111',
    'Riley',
    'Mendoza',
    'Northstar Capital',
    'Program Manager',
    'Casey Creator',
    'Website Inquiry',
    'Funder',
    'Prospect',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '33333333-3333-3333-3333-333333333333',
    '11111111-1111-1111-1111-111111111111',
    'Morgan',
    'Lee',
    'Summit Client Group',
    'Operations Director',
    'Casey Creator',
    'Conference Referral',
    'Client',
    'Active',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '33333333-3333-3333-3333-333333333334',
    '11111111-1111-1111-1111-111111111111',
    'Taylor',
    'Nguyen',
    'Neighborhood Partners',
    'Community Lead',
    'Parker Participant',
    'Warm Introduction',
    'Partner',
    'Active',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  ),
  (
    '33333333-3333-3333-3333-333333333335',
    '11111111-1111-1111-1111-111111111111',
    'Avery',
    'Johnson',
    'Civic Growth Fund',
    'Portfolio Associate',
    'Alex Admin',
    'LinkedIn Outreach',
    'Funder',
    'Prospect',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  ),
  (
    '33333333-3333-3333-3333-333333333336',
    '11111111-1111-1111-1111-111111111111',
    'Cameron',
    'Patel',
    'Riverbank Advisors',
    'Advisor',
    'Casey Creator',
    'Client Referral',
    'Advisor',
    'Active',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '33333333-3333-3333-3333-333333333337',
    '11111111-1111-1111-1111-111111111111',
    'Reese',
    'Carter',
    'Aspire Client Services',
    'Client Success Lead',
    'Parker Participant',
    'Networking Event',
    'Client',
    'Prospect',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  ),
  (
    '33333333-3333-3333-3333-333333333338',
    '11111111-1111-1111-1111-111111111111',
    'Quinn',
    'Baker',
    'Urban Impact Collaborative',
    'Program Partner',
    'Alex Admin',
    'Executive Team Intro',
    'Partner',
    'Active',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  ),
  (
    '33333333-3333-3333-3333-333333333339',
    '11111111-1111-1111-1111-111111111111',
    'Skyler',
    'Davis',
    'Catalyst Foundation',
    'Grant Officer',
    'Casey Creator',
    'Email Campaign',
    'Funder',
    'Prospect',
    '22222222-2222-2222-2222-222222222222',
    '22222222-2222-2222-2222-222222222222'
  ),
  (
    '33333333-3333-3333-3333-33333333333a',
    '11111111-1111-1111-1111-111111111111',
    'Dakota',
    'Wells',
    'Insight Advisory Group',
    'Strategy Consultant',
    'Alex Admin',
    'Prior Engagement',
    'Advisor',
    'Active',
    '22222222-2222-2222-2222-222222222221',
    '22222222-2222-2222-2222-222222222221'
  )
on conflict (unique_id) do update
set
  organization_id = excluded.organization_id,
  first_name = excluded.first_name,
  last_name = excluded.last_name,
  organization = excluded.organization,
  role = excluded.role,
  internal_contact = excluded.internal_contact,
  referred_by = excluded.referred_by,
  contact_type = excluded.contact_type,
  status = excluded.status,
  updated_by = excluded.updated_by,
  updated_at = now();

insert into audit_log (
  id,
  organization_id,
  actor_user_id,
  actor_subject,
  action,
  entity_type,
  entity_id,
  ip,
  user_agent,
  metadata
)
values
  (
    '44444444-4444-4444-4444-444444444441',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222221',
    'azure|access-insights-admin-sub',
    'contacts.create',
    'contacts',
    '33333333-3333-3333-3333-333333333331',
    '127.0.0.1',
    'netlify-dev',
    jsonb_build_object('note', 'Seeded sample contact by admin')
  ),
  (
    '44444444-4444-4444-4444-444444444442',
    '11111111-1111-1111-1111-111111111111',
    '22222222-2222-2222-2222-222222222222',
    'azure|access-insights-creator-sub',
    'contacts.update',
    'contacts',
    '33333333-3333-3333-3333-333333333332',
    '127.0.0.1',
    'netlify-dev',
    jsonb_build_object('note', 'Seeded sample update event by creator')
  )
on conflict (id) do update
set
  organization_id = excluded.organization_id,
  actor_user_id = excluded.actor_user_id,
  actor_subject = excluded.actor_subject,
  action = excluded.action,
  entity_type = excluded.entity_type,
  entity_id = excluded.entity_id,
  ip = excluded.ip,
  user_agent = excluded.user_agent,
  metadata = excluded.metadata;
