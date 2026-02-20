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

# Start the dev server
echo "Starting Vite dev server..."
npm run dev
