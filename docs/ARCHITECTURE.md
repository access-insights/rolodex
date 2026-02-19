# Architecture

Rolodex uses a workspace monorepo with a React frontend and a Netlify Function backend.

## Components
- `apps/web`: Vite + React + TypeScript shell app with route guards and accessible navigation.
- `netlify/functions/api.ts`: single action-based serverless endpoint handling auth, role checks, and contact/user/comment actions.
- `db`: ordered Supabase Postgres migrations for schema, RLS, contact extensions, search, and attributes.
- `docs`: implementation, security, deployment, and testing documentation.

## Runtime flow
1. Browser calls routes served from `apps/web`.
2. Frontend API client calls `VITE_API_BASE` and sends `?action=` values.
3. Netlify redirect maps `/api/*` to `/.netlify/functions/api?action=:splat`.
4. Backend verifies JWT, role guards, organization context, and request rate limits.
5. Action handlers run with DB session context (`app.current_*`) to enforce organization-scoped RLS.
6. Contact and admin operations write audit-log records for traceability.

## Security boundaries
- Azure JWT validation via issuer, audience, and JWKS.
- Role checks for `admin`, `creator`, and `participant`.
- Organization scoping helper for multi-tenant enforcement.
- In-memory rate limiting for basic abuse protection.
- Audit log hook to centralize security and compliance events.
