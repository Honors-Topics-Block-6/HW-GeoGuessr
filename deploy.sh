#!/usr/bin/env bash
#
# deploy.sh — Build and deploy the react-vite-app to Firebase Hosting
# Targets:
#   - https://geogessr-a4adc.web.app/  (old site)
#   - https://hwgeoguessr.web.app/     (new site)
#
set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
EXPECTED_PROJECT="geogessr-a4adc"
OLD_SITE_URL="https://geogessr-a4adc.web.app/"
NEW_SITE_URL="https://hwgeoguessr.web.app/"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${SCRIPT_DIR}/react-vite-app"

# ── Colours (disabled when stdout is not a terminal) ─────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; NC=''
fi

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { error "$@"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "Starting deployment to ${OLD_SITE_URL} and ${NEW_SITE_URL}"

# 1. Verify Firebase CLI is installed
if ! command -v firebase &>/dev/null; then
  die "Firebase CLI is not installed. Install it with: npm install -g firebase-tools"
fi

# 2. Verify we are in the correct repository
if [ ! -f "${SCRIPT_DIR}/firebase.json" ]; then
  die "firebase.json not found in ${SCRIPT_DIR}. Are you in the right repo?"
fi

if [ ! -f "${SCRIPT_DIR}/.firebaserc" ]; then
  die ".firebaserc not found in ${SCRIPT_DIR}. Are you in the right repo?"
fi

# 3. Verify the Firebase project is exactly geogessr-a4adc
CURRENT_PROJECT="$(firebase use --project "${EXPECTED_PROJECT}" 2>/dev/null && firebase use 2>/dev/null | tr -d '[:space:]')" || true

# Also parse .firebaserc directly as an extra safety check
RC_PROJECT="$(python3 -c "import json; print(json.load(open('${SCRIPT_DIR}/.firebaserc'))['projects']['default'])" 2>/dev/null)" || true

if [ "${RC_PROJECT}" != "${EXPECTED_PROJECT}" ]; then
  die "Safety check failed: .firebaserc default project is '${RC_PROJECT}', expected '${EXPECTED_PROJECT}'."
fi

info "Confirmed Firebase project: ${EXPECTED_PROJECT}"

# ── Build ────────────────────────────────────────────────────────────────────
info "Installing dependencies for react-vite-app …"
(cd "${APP_DIR}" && npm install)

info "Building react-vite-app …"
(cd "${APP_DIR}" && npm run build)

# Verify build output exists
if [ ! -f "${APP_DIR}/dist/index.html" ]; then
  die "Build failed: ${APP_DIR}/dist/index.html not found."
fi

info "Build succeeded — dist/ is ready."

# ── Deploy ───────────────────────────────────────────────────────────────────
info "Deploying hosting to Firebase project '${EXPECTED_PROJECT}' (both sites) …"
(cd "${SCRIPT_DIR}" && firebase deploy --only hosting --project "${EXPECTED_PROJECT}")

echo ""
info "Deployment complete!"
info "Live at: ${OLD_SITE_URL}"
info "Live at: ${NEW_SITE_URL}"
