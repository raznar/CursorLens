# syntax=docker/dockerfile:1

##
## Cursor Lens — container image for the dashboards + ingestion.
##
## NOTE: The embedded Ask Agent uses the Cursor SDK's local runtime, which spawns
## Cursor's agent on the host and does NOT run inside this minimal image. Use this
## image for the read-only dashboards and data ingestion; run `npm run dev` /
## `npm run start` on a host with Cursor installed if you need the chat agent.
##

# ---- Build stage ----------------------------------------------------------
FROM node:24-bookworm-slim AS builder
WORKDIR /app

# Toolchain for compiling the better-sqlite3 native addon, used if no prebuilt
# binary matches this platform during `npm ci`.
RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ \
  && rm -rf /var/lib/apt/lists/*

# Install dependencies first for better layer caching. Prefer the reproducible
# `npm ci`; fall back to `npm install` when the committed lockfile omits
# platform-conditional optional deps (e.g. the @emnapi/* wasm-runtime fallback),
# which a lockfile generated on a different OS cannot fully capture for linux.
COPY package.json package-lock.json ./
RUN npm ci || npm install

# Build the Next.js app.
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ---- Runtime stage --------------------------------------------------------
FROM node:24-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    DATA_DIR=/app/data \
    PORT=3000 \
    HOSTNAME=0.0.0.0

# Copy the fully built app, including node_modules. We deliberately keep
# node_modules instead of using Next.js standalone output: better-sqlite3's
# native addon and the Drizzle migrator are awkward to trace into a standalone
# bundle, and the prebuilt binary is ABI-compatible because both stages share
# the same node:24 base image. Keeping `tsx` (a dependency) lets
# `npm run db:migrate` run at container start.
COPY --from=builder --chown=node:node /app ./

# The SQLite database lives in DATA_DIR and is persisted via a mounted volume.
RUN mkdir -p /app/data \
  && chown -R node:node /app/data \
  && chmod +x /app/docker-entrypoint.sh

USER node
EXPOSE 3000

# Apply pending migrations, then run the CMD (the production server).
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
