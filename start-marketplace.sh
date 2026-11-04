#!/usr/bin/env bash

set -Eeuo pipefail

PROJECT_DIR="${PROJECT_DIR:-/workspaces/smart-help-market}"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"
BACKEND_URL="http://127.0.0.1:3000/api/health"
FRONTEND_URL="http://127.0.0.1:5173/"

echo "========================================"
echo " SMART HELP MARKET BY BIGMAZ"
echo " Starting frontend and backend..."
echo "========================================"

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: Node.js/npm is not installed in this environment."
  exit 1
fi

if ! command -v curl >/dev/null 2>&1; then
  echo "ERROR: curl is required to check service status."
  exit 1
fi

start_service() {
  local name="$1"
  local directory="$2"
  local log_file="$3"
  shift 3
  local health_url="$1"
  shift

  if curl -fsS --max-time 2 "$health_url" >/dev/null 2>&1; then
    echo "$name is already running."
    return
  fi

  echo "Preparing $name dependencies..."
  (
    cd "$directory"
    if [ ! -d node_modules ]; then
      if [ -f package-lock.json ]; then
        npm ci
      else
        npm install
      fi
    fi
  )

  echo "Starting $name..."
  (
    cd "$directory"
    nohup "$@" > "$log_file" 2>&1 &
    echo $! > "/tmp/smhm-$name.pid"
  )
}

start_service "backend" "$BACKEND_DIR" "/tmp/smhm-backend.log" "$BACKEND_URL" npm run dev
start_service "frontend" "$FRONTEND_DIR" "/tmp/smhm-frontend.log" "$FRONTEND_URL" npm run dev -- --host 0.0.0.0 --port 5173 --strictPort

echo ""
echo "Waiting for services..."
for attempt in $(seq 1 25); do
  backend_ok=false
  frontend_ok=false

  curl -fsS --max-time 2 "$BACKEND_URL" >/dev/null 2>&1 && backend_ok=true
  curl -fsS --max-time 2 "$FRONTEND_URL" >/dev/null 2>&1 && frontend_ok=true

  if [ "$backend_ok" = true ] && [ "$frontend_ok" = true ]; then
    break
  fi
  sleep 1
done

echo ""
echo "========== SERVICE STATUS =========="
if curl -fsS --max-time 3 "$BACKEND_URL"; then
  echo ""
  echo "Backend: RUNNING on port 3000"
else
  echo "Backend: NOT READY. Check /tmp/smhm-backend.log"
fi

if curl -fsS --max-time 3 "$FRONTEND_URL" >/dev/null 2>&1; then
  echo "Frontend: RUNNING on port 5173"
else
  echo "Frontend: NOT READY. Check /tmp/smhm-frontend.log"
fi

echo ""
echo "Open the Codespaces forwarded port 5173 for the frontend."
echo "Backend health endpoint: /api/health on port 3000"
echo "Logs: /tmp/smhm-backend.log and /tmp/smhm-frontend.log"
echo "========================================"
