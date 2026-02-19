# Database Runbook

## Purpose
Standard process for applying schema migrations and seed data for Rolodex.

## Prerequisites
- `psql` installed and available in `PATH`
- `SUPABASE_DB_URL` set for the target environment
- Repository up to date on your target branch

## Scripts
- `npm run db:migrate`: applies schema migrations in deterministic order
- `npm run db:seed`: applies `db/003_seed.sql`
- `npm run db:setup`: runs migrations, then seed

## Migration Order
`npm run db:migrate` applies:
1. `db/001_init.sql`
2. `db/002_rls.sql`
3. `db/004_contact_extensions.sql`
4. `db/005_contact_attributes_search.sql`
5. `db/006_contact_addresses.sql`
6. `db/007_contact_address_parts.sql`
7. `db/008_drop_legacy_contact_address_columns.sql`
8. `db/009_contact_attribute_investor.sql`
9. `db/010_contact_attribute_adative_sports.sql`
10. `db/011_rename_adative_to_adaptive_sports.sql`
11. `db/012_contact_attributes_accelerator_governement.sql`

Seed is applied separately:
1. `db/003_seed.sql`

## Local Development
1. Set local `SUPABASE_DB_URL` in `.env`.
2. Run:
```bash
npm run db:setup
```
3. Start app:
```bash
npm run dev
```

## Preview/Staging Deployment
1. Point `SUPABASE_DB_URL` to preview/staging database.
2. Run schema only:
```bash
npm run db:migrate
```
3. Apply seed only if that environment requires sample/demo data:
```bash
npm run db:seed
```
4. Deploy app after migration succeeds.

## Production Deployment
1. Confirm backup/snapshot exists before schema changes.
2. Point `SUPABASE_DB_URL` to production database.
3. Run:
```bash
npm run db:migrate
```
4. Do not run `npm run db:seed` in production unless explicitly approved.
5. Deploy app after migration and smoke checks pass.

## Verification Checklist
Run checks after migration:
```sql
select to_regclass('public.organizations') as organizations_table;
select to_regclass('public.contacts') as contacts_table;
select to_regclass('public.contact_comments') as comments_table;
select count(*) as organizations_count from organizations;
```

Optional policy sanity checks:
```sql
select schemaname, tablename, policyname
from pg_policies
where schemaname = 'public'
order by tablename, policyname;
```

## Rollback Guidance
- Forward-fix is preferred when possible.
- If rollback is required:
1. Restore from latest verified backup/snapshot.
2. Reapply last known good app deployment.
3. Re-run smoke checks and verify auth/RLS behavior.

## Failure Handling
- Stop on first migration failure (scripts already use `ON_ERROR_STOP`).
- Capture exact failing SQL and error output.
- Fix SQL in a new migration file rather than editing historical migrations already applied in shared environments.

## Change Management Rules
- Never reorder existing migration files.
- Never modify previously applied migrations in shared environments.
- Add new migration files with next numeric prefix (for example `013_*.sql`).
- Keep seed data idempotent (`on conflict` patterns).
