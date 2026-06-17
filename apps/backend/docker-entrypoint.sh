#!/bin/sh
set -e

# Apply the schema. Prefer committed migrations in production; fall back to a
# `db push` for first-boot/dev environments without a migration history.
echo "→ Syncing database schema…"
if [ -d "prisma/migrations" ] && [ "$(ls -A prisma/migrations 2>/dev/null)" ]; then
  npx prisma migrate deploy
else
  npx prisma db push --skip-generate
fi

# Seed the word dictionary once (idempotent upserts).
if [ "${SEED_ON_BOOT:-true}" = "true" ]; then
  echo "→ Seeding words…"
  npx prisma db seed || echo "seed skipped"
fi

echo "→ Starting Skribble API…"
exec node dist/main.js
