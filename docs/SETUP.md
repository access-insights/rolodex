# Setup

## Prerequisites
- Node.js 20+
- npm 10+
- Netlify CLI (installed as project dependency)

## Install
```bash
npm install
npm run install:all
```

## Configure environment
1. Copy `.env.example` to `.env`.
2. Fill in Supabase and Azure values.
3. Set `DEFAULT_ORG_ID` to a UUID that already exists in `organizations.id`.
4. Keep `.env` local only.

### Local auth + org checks
- Local frontend redirects should stay on `http://localhost:8888`:
  - `VITE_AZURE_REDIRECT_URI=http://localhost:8888`
  - `VITE_AZURE_POST_LOGOUT_REDIRECT_URI=http://localhost:8888/login`
- Backend auth/env must be set: `SUPABASE_DB_URL`, `AZURE_ISSUER`, `AZURE_AUDIENCE`, `AZURE_JWKS_URI`, `DEFAULT_ORG_ID`.
- Confirm the default org row exists before running the app:

```sql
select id, name from organizations where id = '<DEFAULT_ORG_ID_UUID>';
```

- If your token `tid` is used as a fallback org context in any environment, ensure that org row also exists:

```sql
insert into organizations (id, name)
values ('<AZURE_TENANT_ID_UUID>', 'Access Insights (Tenant Fallback)')
on conflict (id) do nothing;
```

## Start local dev
```bash
npm run dev
```

This starts Netlify dev on `http://localhost:8888` and proxies Vite and Functions.
