ARG BUILD_FROM
FROM $BUILD_FROM

# node + build tools: better-sqlite3 v12 ships musl prebuilds for x64/arm64 only;
# armv7/i386 (and any prebuild miss) fall back to compiling from source.
# NOTE: Alpine 3.20 base provides Node 20 — better-sqlite3 must stay on v12
# (v13 segfaults on Node <22.14, see WiseLibs/better-sqlite3#1514).
RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
# Generate the client into src/generated/prisma before tsc. The `prisma` CLI is
# build-only; runtime uses @prisma/client + the better-sqlite3 driver adapter.
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
COPY public ./public

COPY addon/run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
