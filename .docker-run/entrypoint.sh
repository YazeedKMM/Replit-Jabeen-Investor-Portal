#!/usr/bin/env bash
set -euo pipefail

cd /app

echo "==> Pushing database schema (drizzle-kit)..."
pnpm --filter @workspace/db run push-force

echo "==> Seeding demo data..."
# tsx isn't linked into api-server's .bin (repo gotcha); call it from the store.
TSX_BIN=/app/node_modules/.pnpm/node_modules/.bin/tsx
( cd /app/artifacts/api-server && "$TSX_BIN" ./src/seed.ts )

echo "==> Starting API server on :8080..."
( PORT=8080 NODE_ENV=development pnpm --filter @workspace/api-server run dev ) &

echo "==> Starting frontend (Vite) on :5173..."
cd /app/artifacts/jabeen-portal
export PORT=5173
export BASE_PATH=/
exec pnpm exec vite --config vite.config.docker.ts --host 0.0.0.0
