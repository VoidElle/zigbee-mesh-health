ARG BUILD_FROM

# Generate the Prisma client on the build host. Prisma 7 ships no schema-engine
# for 32-bit arm/x86, so `prisma generate` fails on armv7/i386. The generated
# client is plain TypeScript with no native engine (Rust-free query compiler via
# the better-sqlite3 driver adapter), so one host-arch generation is portable.
FROM --platform=$BUILDPLATFORM node:22-alpine AS prisma
WORKDIR /gen
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate

FROM $BUILD_FROM

# node + build tools: better-sqlite3 v12 ships musl prebuilds for x64/arm64 only;
# armv7/i386 (and any prebuild miss) fall back to compiling from source.
# NOTE: base 3.22 provides Node 22.23 (Prisma 7 needs >=20.19/>=22.12); 3.20's
# Node 20 is too old. Keep better-sqlite3 on v12 (v13 segfaults on Node <22.14,
# see WiseLibs/better-sqlite3#1514).
RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
# Client is generated in the prisma stage above, not here (see comment there).
COPY --from=prisma /gen/src/generated ./src/generated
COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build && npm run css && npm prune --omit=dev

COPY addon/run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
