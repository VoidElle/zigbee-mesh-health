FROM node:22-alpine

# build tools: better-sqlite3 v13 ships musl prebuilds for x64/arm64 only;
# armv7/i386 (and any prebuild miss) fall back to compiling from source
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

# Prisma client is generated into src/generated/prisma, so it must run before tsc.
# The `prisma` CLI is build-only; runtime uses @prisma/client + the driver adapter.
# tsconfig.json must be present before `prisma generate`: the prisma-client
# generator infers CJS vs ESM (and import extensions) from it. Without it the
# client is emitted ESM-flavoured (import.meta) and crashes at runtime.
COPY tsconfig.json ./
COPY prisma ./prisma
RUN npx prisma generate

COPY src ./src
COPY public ./public
# No `npm run css` here: public/styles.css is generated locally and committed.
# Tailwind v4's lightningcss ships no musl prebuilds for armv7/i386, so running
# it in-image would fail those arches. Only the JS is built here.
RUN npm run build && npm prune --omit=dev

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 8080
CMD ["node", "dist/index.js"]
