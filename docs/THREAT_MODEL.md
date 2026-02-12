# Threat Model

## Assets
- Contact records and organization-scoped metadata.
- User identities and role assignments.
- Admin actions and audit trails.

## Entry points
- Browser routes in `apps/web`.
- API actions via `/.netlify/functions/api`.
- CI and deployment configuration.

## Key threats and mitigations
- Token spoofing: JWT validation against Azure issuer, audience, and JWKS.
- Horizontal data access: organization scoping helper and planned RLS enforcement.
- Privilege escalation: explicit role guard per action.
- Abuse and scraping: in-memory rate limiting baseline.
- Logging data leaks: structured audit helper with controlled fields.

## Deferred items for Prompt 2+
- Full DB schema with strict RLS policies.
- Durable rate limiting store.
- Security event shipping and alerting.
