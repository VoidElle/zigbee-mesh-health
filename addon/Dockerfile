ARG BUILD_FROM
FROM $BUILD_FROM

# node + build tools for better-sqlite3 (musl has no prebuilt binaries)
RUN apk add --no-cache nodejs npm python3 make g++

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev
COPY public ./public

COPY run.sh /
RUN chmod a+x /run.sh

CMD ["/run.sh"]
