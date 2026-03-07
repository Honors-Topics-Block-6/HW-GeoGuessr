#!/usr/bin/env bash
#
# auto-deploy.sh — Runs merge-and-deploy.sh every hour
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
INTERVAL=3600  # 1 hour in seconds

echo "[auto-deploy] Starting. Will run merge-and-deploy.sh every hour."
echo "[auto-deploy] Press Ctrl+C to stop."
echo ""

while true; do
  echo "[auto-deploy] $(date '+%Y-%m-%d %H:%M:%S') — Running merge-and-deploy.sh"
  "$SCRIPT_DIR/merge-and-deploy.sh" </dev/null || echo "[auto-deploy] merge-and-deploy.sh exited with error"
  echo ""
  echo "[auto-deploy] Sleeping for 1 hour..."
  sleep $INTERVAL
done
