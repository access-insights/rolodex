# Rolodex

Infrastructure scaffold for the Access Insights contact database app.

## Monorepo layout
- `apps/web`: React + TypeScript + Vite frontend shell
- `netlify/functions`: Netlify serverless API skeleton
- `db`: Supabase migration stubs
- `docs`: setup, architecture, deployment, testing, accessibility, threat model, database runbook

## Quick start
```bash
npm install
npm run install:all
cp .env.example .env
npm run db:setup
npm run dev
```

Local app URL: `http://localhost:8888`

## Scripts
- `npm run dev` run Netlify dev
- `npm run build` build frontend
- `npm run lint` lint frontend and typecheck functions
- `npm run test` run unit tests
- `npm run test:a11y` run accessibility smoke tests
- `npm run test:e2e` run Playwright smoke tests
- `npm run db:migrate` apply schema migrations to `SUPABASE_DB_URL`
- `npm run db:seed` apply seed data to `SUPABASE_DB_URL`
- `npm run db:setup` run migrations and seed in order
- `npm run install:all` install root and workspace dependencies
