FROM node:22-alpine

# build tools: better-sqlite3 v12 ships musl prebuilds for x64/arm64 only;
# armv7/i386 (and any prebuild miss) fall back to compiling from source
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Prisma client is generated into src/generated/prisma, so it must run before tsc.
# The `prisma` CLI is build-only; runtime uses @prisma/client + the driver adapter.
COPY prisma ./prisma
RUN npx prisma generate

COPY tsconfig.json ./
COPY src ./src
COPY public ./public
RUN npm run build && npm run css && npm prune --omit=dev

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 8080
CMD ["node", "dist/index.js"]
