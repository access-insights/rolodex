# Deployment

## Netlify
- Build command: `npm run build`
- Publish directory: `apps/web/dist`
- Functions directory: `netlify/functions`

## Required environment variables
Set these values in Netlify site settings:
- `SUPABASE_DB_URL` (full valid Postgres URI; pooler preferred)
- `AZURE_ISSUER`
- `AZURE_AUDIENCE`
- `AZURE_JWKS_URI`
- `DEFAULT_ORG_ID` (UUID present in `organizations.id`)
- `VITE_AZURE_CLIENT_ID`
- `VITE_AZURE_TENANT_ID`
- `VITE_AZURE_REDIRECT_URI`
- `VITE_AZURE_POST_LOGOUT_REDIRECT_URI`

## Production checklist
- Azure app registration redirects include production domain.
- `AZURE_ISSUER`, `AZURE_AUDIENCE`, and `AZURE_JWKS_URI` match token issuer settings.
- `DEFAULT_ORG_ID` is a UUID and the row exists in `organizations`.
- If any environment falls back to Azure `tid` for org context, that `organizations.id` row exists too.
- Netlify redirects are deployed with `netlify.toml`.
