c#!/bin/bash

# Kill any running Vite dev server processes for THIS project only
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Killing Vite processes for this project..."
pkill -f "${PROJECT_DIR}/react-vite-app.*vite" 2>/dev/null || true
pkill -f "vite.*${PROJECT_DIR}/react-vite-app" 2>/dev/null || true

# Give processes time to terminate
sleep 1

# Navigate to the react-vite-app directory
cd "$(dirname "$0")/react-vite-app"

# Ensure a Vite-compatible Node version is active and meets requirements (>= 20.19).
if [ -z "${NVM_DIR:-}" ]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || nvm install 20 >/dev/null 2>&1
fi

REQUIRED_MAJOR=20
REQUIRED_MINOR=19

CURRENT_VERSION="$(node -v 2>/dev/null | sed 's/^v//')"
CURRENT_MAJOR="$(echo "$CURRENT_VERSION" | cut -d. -f1)"
CURRENT_MINOR="$(echo "$CURRENT_VERSION" | cut -d. -f2)"

is_compatible=false
if [[ -n "$CURRENT_MAJOR" && -n "$CURRENT_MINOR" ]]; then
  if (( CURRENT_MAJOR > REQUIRED_MAJOR )); then
    is_compatible=true
  elif (( CURRENT_MAJOR == REQUIRED_MAJOR && CURRENT_MINOR >= REQUIRED_MINOR )); then
    is_compatible=true
  fi
fi

if [[ "$is_compatible" == false ]]; then
  echo "Error: Node.js v${REQUIRED_MAJOR}.${REQUIRED_MINOR}+ is required (found v${CURRENT_VERSION:-unknown})."
  echo "Install/use Node 20.19+ (or 22.12+) and rerun ./run.sh."
  echo "Tip: if you use nvm, run: nvm install && nvm use"
  exit 1
fi
# Start the dev server
echo "Starting Vite dev server..."
npm run dev
