FROM node:22-alpine

# build tools for better-sqlite3 native compilation (musl has no prebuilt binaries)
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

COPY public ./public

ENV DATA_DIR=/app/data
RUN mkdir -p /app/data
VOLUME /app/data

EXPOSE 8080
CMD ["node", "dist/index.js"]
