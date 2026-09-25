# Build Stage for Frontend
FROM node:22.17.1-bookworm-slim AS node-build-runtime
FROM oven/bun:1.3.14 AS builder-web
COPY --from=node-build-runtime /usr/local/bin/node /usr/local/bin/node
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app

# The Bun lock belongs to the workspace root, so install from that same root.
COPY package.json bun.lock ./
COPY web/package.json web/package.json
COPY refer/re_sekai-calculator/package.json refer/re_sekai-calculator/package.json
RUN bun install --frozen-lockfile

COPY web/ web/
COPY refer/re_sekai-calculator/ refer/re_sekai-calculator/
WORKDIR /app/web
# Build validation must use production URL policy before sitemap generation and Next.js compilation.
ENV NODE_ENV=production
# Set API URL empty to allow relative fetching
ENV NEXT_PUBLIC_API_URL=
# OAuth2 client ID (baked into client JS at build time)
ENV NEXT_PUBLIC_OAUTH2_CLIENT_ID=snowy-viewer-public
# Public Moly resource directory (bucket path included) is inlined into client JS
# by Next.js. Empty ships the site without the feature.
ARG NEXT_PUBLIC_MOLY_RESOURCE_BASE=
ENV NEXT_PUBLIC_MOLY_RESOURCE_BASE=$NEXT_PUBLIC_MOLY_RESOURCE_BASE
# Public lyrics artifacts. Production accepts only a credential-free HTTPS directory;
# sitemap generation derives index.json from the same explicitly supplied source.
# CI may mount a short-lived synthetic CA only for the required image build contract;
# the secret is available to this build step only and is never copied into the image.
ARG NEXT_PUBLIC_LYRICS_BASE_URL=https://translation.exmeaning.com/files/translation/lyrics
ENV NEXT_PUBLIC_LYRICS_BASE_URL=$NEXT_PUBLIC_LYRICS_BASE_URL
# Build-time data sources. Multiple URLs allow Docker builds to survive flaky DNS/proxy/CDN paths.
ARG MASTER_DATA_URLS=https://metadata.exmeaning.com/{region}/master,https://metadata.pjsk.moe/{region}/master
ARG MANGA_DATA_URLS=https://moe.exmeaning.com/mangas/mangas.json
ARG REQUIRE_FRESH_BUILD_DATA=0
ENV MASTER_DATA_URLS=$MASTER_DATA_URLS
ENV MANGA_DATA_URLS=$MANGA_DATA_URLS
ENV REQUIRE_FRESH_BUILD_DATA=$REQUIRE_FRESH_BUILD_DATA
RUN --mount=type=secret,id=public_lyrics_ca,required=false \
    if [ -f /run/secrets/public_lyrics_ca ]; then \
      export NODE_EXTRA_CA_CERTS=/run/secrets/public_lyrics_ca; \
    fi; \
    export REQUIRE_PUBLIC_LYRICS_SOURCE=1; \
    bun run copy:wasm && bun run sitemap && bun run generate:metadata && bun run build:next

# Build Stage for Backend
FROM golang:1.23.12-alpine3.22 AS builder-go
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY internal ./internal
COPY main.go .
RUN CGO_ENABLED=0 go build -ldflags="-w -s" -o server main.go

# Runtime Stage
FROM node:22.17.1-alpine3.22
WORKDIR /app

RUN apk add --no-cache ca-certificates tini wget

# Copy Backend and Next.js standalone server.
COPY --from=builder-go --chown=node:node /app/server ./server
COPY --from=builder-web --chown=node:node /app/web/.next/standalone ./nextjs/
COPY --from=builder-web --chown=node:node /app/web/.next/static ./nextjs/web/.next/static
COPY --from=builder-web --chown=node:node /app/web/public ./nextjs/web/public
COPY --chown=node:node --chmod=755 scripts/start-container.sh ./start.sh
RUN mkdir -p /app/data && chown node:node /app/data

# Translation files are served from Next.js public directory.
ENV TRANSLATION_PATH=/app/nextjs/web/public/data/translations
ENV TRANSLATION_AUTO_PUSH_ENABLED=false
ENV FRONTEND_PROXY_URL=http://127.0.0.1:3000
ENV INTERNAL_NEXT_ORIGIN=http://127.0.0.1:3000
ENV STATIC_ARCHIVE_DIR=/app/data/static_archive
ENV HTML_CACHE_DIR=/app/data/html_cache
ENV NODE_ENV=production

USER node

# Go is the single entry point. The container is ready only after masterdata loads.
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=3s --start-period=45s --retries=3 \
    CMD wget -q --spider "http://127.0.0.1:${PORT:-8080}/readyz" || exit 1
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["/app/start.sh"]
