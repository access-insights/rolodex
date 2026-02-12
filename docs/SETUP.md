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
3. Keep `.env` local only.

## Start local dev
```bash
npm run dev
```

This starts Netlify dev on `http://localhost:8888` and proxies Vite and Functions.
