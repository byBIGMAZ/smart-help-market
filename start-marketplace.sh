#!/usr/bin/env bash

set -e

PROJECT_DIR="/workspaces/smart-help-market"
BACKEND_DIR="$PROJECT_DIR/backend"
FRONTEND_DIR="$PROJECT_DIR/frontend"

echo "========================================"
echo " SMART HELP MARKET BY BIGMAZ"
echo " Starting marketplace services..."
echo "========================================"

# Start backend if it is not already responding.
if curl -sS --max-time 2 http://127.0.0.1:3000/ -o /dev/null 2>/dev/null; then
  echo "Backend already running on port 3000."
else
  echo "Starting backend..."
  (
    cd "$BACKEND_DIR"
    nohup npm run dev > /tmp/smhm-backend.log 2>&1 &
    echo $! > /tmp/smhm-backend.pid
  )
fi

# Start frontend if it is not already responding.
if curl -sS --max-time 2 http://127.0.0.1:5173/ -o /dev/null 2>/dev/null; then
  echo "Frontend already running on port 5173."
else
  echo "Starting frontend..."
  (
    cd "$FRONTEND_DIR"
    nohup npm run dev -- --host 0.0.0.0 --port 5173 --strictPort \
      > /tmp/smhm-frontend.log 2>&1 &
    echo $! > /tmp/smhm-frontend.pid
  )
fi

echo "Waiting for services to start..."
sleep 5

echo ""
echo "========== SERVICE STATUS =========="

if curl -sS --max-time 3 http://127.0.0.1:3000/ -o /dev/null 2>/dev/null; then
  echo "Backend: RUNNING (port 3000)"
else
  echo "Backend: CHECK LOG /tmp/smhm-backend.log"
fi

if curl -sS --max-time 3 http://127.0.0.1:5173/ -o /dev/null 2>/dev/null; then
  echo "Frontend: RUNNING (port 5173)"
else
  echo "Frontend: CHECK LOG /tmp/smhm-frontend.log"
fi

echo ""
echo "Frontend address inside Codespace: http://localhost:5173"
echo "========================================"
