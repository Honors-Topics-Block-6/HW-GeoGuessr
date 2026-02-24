#!/usr/bin/env bash
#
# setup.sh — One-time setup for HW-GeoGuessr after cloning
#
# What it does:
#   1. Verifies / installs the correct Node.js version (via nvm)
#   2. Installs npm dependencies for the React app
#   3. Ensures a .env file exists with the required Firebase config
#   4. Optionally installs the Firebase CLI (for deployment)
#   5. Runs a quick build + typecheck to confirm everything works
#
set -euo pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
APP_DIR="${SCRIPT_DIR}/react-vite-app"
ENV_FILE="${SCRIPT_DIR}/.env"
ENV_EXAMPLE="${SCRIPT_DIR}/.env.example"

# ── Colours (disabled when stdout is not a terminal) ─────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

info()  { echo -e "${GREEN}[✓]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[!]${NC}  $*"; }
error() { echo -e "${RED}[✗]${NC}  $*" >&2; }
step()  { echo -e "\n${BLUE}───${NC} $* ${BLUE}───${NC}"; }

# ── 1. Node.js version ──────────────────────────────────────────────────────
REQUIRED_MAJOR=20
REQUIRED_MINOR=19

check_node_version() {
  local version major minor
  version="$(node -v 2>/dev/null | sed 's/^v//')" || true
  major="$(echo "$version" | cut -d. -f1)"
  minor="$(echo "$version" | cut -d. -f2)"

  if [[ -n "$major" && -n "$minor" ]]; then
    if (( major > REQUIRED_MAJOR )) || \
       (( major == REQUIRED_MAJOR && minor >= REQUIRED_MINOR )); then
      return 0
    fi
  fi
  return 1
}

step "Checking Node.js (need v${REQUIRED_MAJOR}.${REQUIRED_MINOR}+)"

if check_node_version; then
  info "Node.js $(node -v) is installed and compatible"
else
  # Try loading nvm
  if [[ -s "$HOME/.nvm/nvm.sh" ]]; then
    # shellcheck disable=SC1091
    source "$HOME/.nvm/nvm.sh"
    warn "Current Node.js is too old or missing — installing via nvm..."
    nvm install 2>/dev/null  # reads .nvmrc
    nvm use    2>/dev/null
  fi

  if check_node_version; then
    info "Node.js $(node -v) is now active"
  else
    error "Node.js v${REQUIRED_MAJOR}.${REQUIRED_MINOR}+ is required (found $(node -v 2>/dev/null || echo 'none'))."
    echo "  Install nvm (https://github.com/nvm-sh/nvm) then re-run this script,"
    echo "  or manually install Node 20.19+ / 22.12+."
    exit 1
  fi
fi

# ── 2. Install app dependencies ─────────────────────────────────────────────
step "Installing dependencies (react-vite-app)"

if [[ ! -d "$APP_DIR" ]]; then
  error "react-vite-app/ directory not found — is the repo intact?"
  exit 1
fi

(cd "$APP_DIR" && npm install)
info "npm packages installed"

# ── 3. Environment file (.env) ──────────────────────────────────────────────
step "Checking environment file"

if [[ -f "$ENV_FILE" ]]; then
  # Verify all required keys are present and non-empty
  MISSING_KEYS=()
  while IFS='=' read -r key _; do
    # Skip blank lines and comments
    [[ -z "$key" || "$key" == \#* ]] && continue
    if ! grep -q "^${key}=.\+" "$ENV_FILE" 2>/dev/null; then
      MISSING_KEYS+=("$key")
    fi
  done < "$ENV_EXAMPLE"

  if [[ ${#MISSING_KEYS[@]} -gt 0 ]]; then
    warn ".env exists but is missing values for:"
    for k in "${MISSING_KEYS[@]}"; do
      echo "       $k"
    done
    echo "  Fill them in before running the app."
  else
    info ".env file is present and has all required keys"
  fi
else
  warn ".env file not found — creating from .env.example"
  cp "$ENV_EXAMPLE" "$ENV_FILE"
  warn "Please fill in your Firebase credentials in .env before running the app."
  echo "  See .env.example for the required keys, or ask a team member."
fi

# ── 4. Firebase CLI (optional) ──────────────────────────────────────────────
step "Checking Firebase CLI (optional — needed only for deployment)"

if command -v firebase &>/dev/null; then
  info "Firebase CLI is installed ($(firebase --version 2>/dev/null || echo 'unknown version'))"
else
  warn "Firebase CLI is not installed."
  echo "  If you need to deploy, install it later with:"
  echo "    npm install -g firebase-tools"
fi

# ── 5. Verification build + typecheck ───────────────────────────────────────
step "Running verification build"

BUILD_OK=true

# Typecheck
if (cd "$APP_DIR" && npx tsc --noEmit 2>/dev/null); then
  info "TypeScript typecheck passed"
else
  warn "TypeScript typecheck had errors (non-blocking — you can still run the dev server)"
  BUILD_OK=false
fi

# Vite build
if (cd "$APP_DIR" && npm run build -- --logLevel error 2>/dev/null); then
  info "Production build succeeded"
else
  warn "Production build failed (non-blocking — try 'npm run dev' to see detailed errors)"
  BUILD_OK=false
fi

# ── Done ─────────────────────────────────────────────────────────────────────
echo ""
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo -e "${GREEN}  Setup complete!${NC}"
echo -e "${GREEN}════════════════════════════════════════════════${NC}"
echo ""

if [[ ! -f "$ENV_FILE" ]] || [[ ${#MISSING_KEYS[@]:-0} -gt 0 ]]; then
  echo "  Next step:  Fill in your .env file with Firebase credentials"
  echo ""
fi

echo "  Start the dev server:"
echo "    ./run.sh"
echo ""
echo "  Run tests:"
echo "    ./test.sh"
echo ""
echo "  Deploy (requires Firebase CLI):"
echo "    ./deploy.sh"
echo ""
