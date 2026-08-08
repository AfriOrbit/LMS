#!/usr/bin/env bash
#
# Run the RLS and business-rule test suite.
#
# Two modes:
#   1. Against a running local Supabase stack (preferred):
#        npm run db:start && npm run db:test
#   2. Against any PostgreSQL you point DATABASE_URL at, using the shim in
#      supabase/tests/00_supabase_shim.sql to stand in for Supabase's auth and
#      storage schemas. This is what CI uses.
#
# The suite exits non-zero on the first failed assertion.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DB_URL="${DATABASE_URL:-postgresql://postgres:postgres@127.0.0.1:54322/postgres}"
USE_SHIM="${USE_SHIM:-0}"

if ! command -v psql >/dev/null 2>&1; then
  echo "psql is required. Install the PostgreSQL client package." >&2
  exit 1
fi

echo "→ Target: ${DB_URL%%\?*}"

if [ "$USE_SHIM" = "1" ]; then
  echo "→ Applying Supabase shim and migrations"
  psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$ROOT/supabase/tests/00_supabase_shim.sql" >/dev/null
  for migration in "$ROOT"/supabase/migrations/*.sql; do
    echo "   $(basename "$migration")"
    psql "$DB_URL" -q -v ON_ERROR_STOP=1 -f "$migration" >/dev/null
  done
fi

echo "→ Running assertions"
if psql "$DB_URL" -q -v ON_ERROR_STOP=1 \
      -f "$ROOT/supabase/tests/01_rls_security.sql" 2>&1 \
      | sed -n 's/^psql.*NOTICE:  //p; /^=\{10,\}/p; /passed\./p'; then
  echo "→ OK"
else
  echo "→ FAILED" >&2
  exit 1
fi
