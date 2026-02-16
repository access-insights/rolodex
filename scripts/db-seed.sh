#!/usr/bin/env bash
set -euo pipefail

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required but not installed."
  exit 1
fi

if [[ -z "${SUPABASE_DB_URL:-}" ]]; then
  echo "SUPABASE_DB_URL is required."
  exit 1
fi

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_DIR="$ROOT_DIR/db"
SEED_FILE="$DB_DIR/003_seed.sql"

echo "Applying 003_seed.sql"
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$SEED_FILE"
echo "Seed complete."
