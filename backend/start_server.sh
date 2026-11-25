#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"
HOST="${PORTAL_HOST:-127.0.0.1}"
PORT="${PORTAL_PORT:-8000}"

echo "Starting Lung Radiology FM Portal FastAPI server on http://${HOST}:${PORT} (PORTAL_MOCK=${PORTAL_MOCK:-0})"
exec uvicorn server:app --host "${HOST}" --port "${PORT}"
