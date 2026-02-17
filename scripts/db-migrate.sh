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

MIGRATIONS=(
  "001_init.sql"
  "002_rls.sql"
  "004_contact_extensions.sql"
  "005_contact_attributes_search.sql"
  "006_contact_addresses.sql"
  "007_contact_address_parts.sql"
  "008_drop_legacy_contact_address_columns.sql"
  "009_contact_attribute_investor.sql"
)

for file in "${MIGRATIONS[@]}"; do
  path="$DB_DIR/$file"
  echo "Applying $file"
  psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f "$path"
done

echo "Migrations complete."
