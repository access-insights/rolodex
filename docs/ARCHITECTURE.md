# Architecture

Rolodex uses a workspace monorepo with a React frontend and a Netlify Function backend.

## Components
- `apps/web`: Vite + React + TypeScript shell app with route guards and accessible navigation.
- `netlify/functions/api.ts`: single action-based serverless endpoint for placeholder API actions.
- `db`: migration stubs for Supabase Postgres schema and RLS.
- `docs`: implementation, security, deployment, and testing documentation.

## Runtime flow
1. Browser calls routes served from `apps/web`.
2. Frontend API client calls `VITE_API_BASE` and sends `?action=` values.
3. Netlify redirect maps `/api/*` to `/.netlify/functions/api?action=:splat`.
4. Backend verifies JWT, role guards, and organization context before placeholder handlers.
5. Supabase client is available for Prompt 2 schema integration.

## Security boundaries
- Azure JWT validation via issuer, audience, and JWKS.
- Role checks for `admin`, `creator`, and `participant`.
- Organization scoping helper for multi-tenant enforcement.
- In-memory rate limiting for basic abuse protection.
- Audit log hook to centralize security and compliance events.
