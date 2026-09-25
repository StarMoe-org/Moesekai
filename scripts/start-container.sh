#!/bin/sh
set -eu

NEXTJS_PID=""
GO_PID=""
GO_PORT="${PORT:-8080}"
NEXTJS_PORT="${NEXTJS_PORT:-3000}"

case "$GO_PORT" in
    ''|*[!0-9]*) echo "PORT must be a numeric TCP port" >&2; exit 1 ;;
esac
case "$NEXTJS_PORT" in
    ''|*[!0-9]*) echo "NEXTJS_PORT must be a numeric TCP port" >&2; exit 1 ;;
esac
if [ "$GO_PORT" -lt 1 ] || [ "$GO_PORT" -gt 65535 ] || [ "$NEXTJS_PORT" -lt 1 ] || [ "$NEXTJS_PORT" -gt 65535 ]; then
    echo "PORT and NEXTJS_PORT must be between 1 and 65535" >&2
    exit 1
fi
if [ "$GO_PORT" -eq "$NEXTJS_PORT" ]; then
    echo "PORT and NEXTJS_PORT must be different" >&2
    exit 1
fi

cleanup() {
    trap - EXIT INT TERM
    if [ -n "$NEXTJS_PID" ]; then
        kill -TERM "$NEXTJS_PID" 2>/dev/null || true
    fi
    if [ -n "$GO_PID" ]; then
        kill -TERM "$GO_PID" 2>/dev/null || true
    fi
    for _ in 1 2 3 4 5; do
        NEXTJS_ALIVE=0
        GO_ALIVE=0
        [ -z "$NEXTJS_PID" ] || ! kill -0 "$NEXTJS_PID" 2>/dev/null || NEXTJS_ALIVE=1
        [ -z "$GO_PID" ] || ! kill -0 "$GO_PID" 2>/dev/null || GO_ALIVE=1
        [ "$NEXTJS_ALIVE" -eq 1 ] || [ "$GO_ALIVE" -eq 1 ] || break
        sleep 1
    done
    [ -z "$NEXTJS_PID" ] || kill -KILL "$NEXTJS_PID" 2>/dev/null || true
    [ -z "$GO_PID" ] || kill -KILL "$GO_PID" 2>/dev/null || true
    [ -z "$NEXTJS_PID" ] || wait "$NEXTJS_PID" 2>/dev/null || true
    [ -z "$GO_PID" ] || wait "$GO_PID" 2>/dev/null || true
}

trap cleanup EXIT
trap 'exit 143' INT TERM

ARCHIVE_DIR="${STATIC_ARCHIVE_DIR:-/app/data/static_archive}"
CACHE_DIR="${HTML_CACHE_DIR:-/app/data/html_cache}"
MAX_DAYS="${STATIC_CACHE_MAX_DAYS:-30}"
case "$MAX_DAYS" in
    ''|*[!0-9]*) echo "STATIC_CACHE_MAX_DAYS must be a non-negative integer" >&2; exit 1 ;;
esac
mkdir -p "$ARCHIVE_DIR" "$CACHE_DIR"
if [ ! -w "$ARCHIVE_DIR" ]; then
    echo "Static archive directory is not writable: $ARCHIVE_DIR" >&2
    exit 1
fi
if [ ! -w "$CACHE_DIR" ]; then
    echo "HTML cache directory is not writable: $CACHE_DIR" >&2
    exit 1
fi
if [ -d /app/nextjs/web/.next/static ]; then
    echo "Syncing Next.js static assets to $ARCHIVE_DIR..."
    cp -r /app/nextjs/web/.next/static/. "$ARCHIVE_DIR/"
fi
if [ "$MAX_DAYS" -gt 0 ]; then
    echo "Cleaning up static assets older than $MAX_DAYS days in $ARCHIVE_DIR..."
    find "$ARCHIVE_DIR" -mindepth 1 -type f -mtime +"$MAX_DAYS" -delete 2>/dev/null || true
    find "$ARCHIVE_DIR" -mindepth 1 -depth -type d -empty -delete 2>/dev/null || true
fi

(
    cd /app/nextjs/web
    exec env \
        PORT="$NEXTJS_PORT" \
        HOSTNAME=127.0.0.1 \
        INTERNAL_NEXT_ORIGIN="${INTERNAL_NEXT_ORIGIN:-http://127.0.0.1:$NEXTJS_PORT}" \
        NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=512}" \
        node server.js
) &
NEXTJS_PID=$!

echo "Waiting for Next.js to start..."
NEXTJS_READY=0
for attempt in 1 2 3 4 5 6 7 8 9 10 11 12 13 14 15; do
    if wget -q --spider "http://127.0.0.1:$NEXTJS_PORT/internal-healthz/" 2>/dev/null; then
        NEXTJS_READY=1
        echo "Next.js is ready"
        break
    fi
    if ! kill -0 "$NEXTJS_PID" 2>/dev/null; then
        echo "Next.js exited during startup" >&2
        exit 1
    fi
    echo "Attempt $attempt: Next.js not ready yet, waiting..."
    sleep 2
done

if [ "$NEXTJS_READY" -ne 1 ]; then
    echo "Next.js did not become ready in time" >&2
    exit 1
fi

(
    cd /app
    exec env \
        FRONTEND_PROXY_URL="${FRONTEND_PROXY_URL:-http://127.0.0.1:$NEXTJS_PORT}" \
        ./server
) &
GO_PID=$!

# Go listens only after restoring the persistent HTML cache index (about 90k pages
# in production), which can take far longer than 10s on a cold volume.
echo "Waiting for the combined service health check..."
SERVICE_READY=0
GO_STARTUP_SECONDS=180
attempt=0
while [ "$attempt" -lt "$GO_STARTUP_SECONDS" ]; do
    attempt=$((attempt + 1))
    if wget -q --spider "http://127.0.0.1:$GO_PORT/healthz" 2>/dev/null; then
        SERVICE_READY=1
        echo "Combined service is ready (attempt ${attempt})"
        break
    fi
    if ! kill -0 "$GO_PID" 2>/dev/null; then
        echo "Go server exited during startup" >&2
        exit 1
    fi
    if [ $((attempt % 15)) -eq 0 ]; then
        echo "Still waiting for the Go server (attempt ${attempt} of ${GO_STARTUP_SECONDS})..."
    fi
    sleep 1
done

if [ "$SERVICE_READY" -ne 1 ]; then
    echo "Combined service did not become ready in time" >&2
    exit 1
fi

FAILURES=0
while true; do
    if ! kill -0 "$NEXTJS_PID" 2>/dev/null; then
        echo "Next.js exited unexpectedly" >&2
        exit 1
    fi
    if ! kill -0 "$GO_PID" 2>/dev/null; then
        echo "Go server exited unexpectedly" >&2
        exit 1
    fi

    if wget -q --spider "http://127.0.0.1:$GO_PORT/healthz" 2>/dev/null; then
        FAILURES=0
    else
        FAILURES=$((FAILURES + 1))
        echo "Combined health check failed ($FAILURES/3)"
        if [ "$FAILURES" -ge 3 ]; then
            echo "Service remained unhealthy; exiting so the container can restart" >&2
            exit 1
        fi
    fi
    sleep 5
done
