# Deployment

## Netlify
- Build command: `npm run build`
- Publish directory: `apps/web/dist`
- Functions directory: `netlify/functions`

## Required environment variables
Set all values from `.env.example` in Netlify site settings and GitHub secrets as needed.

## Production checklist
- Azure app registration redirects include production domain.
- Supabase project keys are scoped and rotated.
- `AZURE_ISSUER`, `AZURE_AUDIENCE`, and `AZURE_JWKS_URI` match token issuer settings.
- Netlify redirects are deployed with `netlify.toml`.
