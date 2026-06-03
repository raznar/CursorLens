#!/bin/sh
set -e

# Apply pending Drizzle migrations to the SQLite database in DATA_DIR before
# starting the server. Migrations are idempotent, so this is safe on every boot.
echo "[entrypoint] applying database migrations to ${DATA_DIR:-/app/data} ..."
npm run db:migrate

echo "[entrypoint] starting: $*"
exec "$@"
