#!/bin/bash

# Kill any running Vite dev server processes for THIS project only
PROJECT_DIR="$(cd "$(dirname "$0")" && pwd)"
echo "Killing Vite processes for this project..."
pkill -f "${PROJECT_DIR}/react-vite-app.*vite" 2>/dev/null || true
pkill -f "vite.*${PROJECT_DIR}/react-vite-app" 2>/dev/null || true

# Give processes time to terminate
sleep 1

# Navigate to the react-vite-app directory
cd "$(dirname "$0")/react-vite-app"

# Ensure a Vite-compatible Node version is active.
if [ -z "${NVM_DIR:-}" ]; then
  export NVM_DIR="$HOME/.nvm"
fi

if [ -s "$NVM_DIR/nvm.sh" ]; then
  # shellcheck source=/dev/null
  . "$NVM_DIR/nvm.sh"
  nvm use 20 >/dev/null 2>&1 || nvm install 20 >/dev/null 2>&1
fi

NODE_MAJOR="$(node -p "process.versions.node.split('.')[0]")"
if [ "$NODE_MAJOR" -lt 20 ]; then
  echo "Error: Node $(node -v) detected. Vite requires Node 20.19+ or 22.12+."
  echo "Install/activate Node 20+ (e.g. 'nvm install 20 && nvm use 20') and retry."
  exit 1
fi

# Start the dev server
echo "Starting Vite dev server..."
npm run dev
