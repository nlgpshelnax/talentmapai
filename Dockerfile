# syntax=docker/dockerfile:1

# ─────────────────────────────────────────────────────────────────────────────
#  TalentMap AI — production image
#
#  Multi-stage so the final image carries no build toolchain and no dev deps.
#  One process serves both the API and the built React client.
# ─────────────────────────────────────────────────────────────────────────────

# ── 1. Build the React client ────────────────────────────────────────────────
FROM node:22-bookworm-slim AS client-build

WORKDIR /build/client
COPY client/package*.json ./
RUN npm ci --no-audit --no-fund

COPY client/ ./
RUN npm run build


# ── 2. Install production server dependencies ────────────────────────────────
# sqlite3 ships prebuilt binaries, but keep the toolchain available so the
# image still builds if a prebuild is unavailable for the target platform.
FROM node:22-bookworm-slim AS server-deps

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund


# ── 3. Runtime ───────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runtime

ENV NODE_ENV=production \
    PORT=3000 \
    DB_PATH=/data/talentmap.db \
    UPLOAD_DIR=/data/uploads

WORKDIR /app

COPY --from=server-deps /build/node_modules ./node_modules
COPY package.json ./
COPY server.js ./
COPY src/ ./src/
COPY --from=client-build /build/client/dist ./client/dist

# Writable location for the SQLite file and portfolio uploads. Mount a volume
# here to keep user data across deploys; without one the app simply reseeds
# itself on boot, which is the desired behaviour for a demo instance.
RUN mkdir -p /data/uploads && chown -R node:node /data /app

USER node

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "server.js"]
