#!/usr/bin/env bash
#
# take_backup.sh — Export the entire Firestore database to a local JSON snapshot.
#
# Prerequisites:
#   1. Node.js installed
#   2. A Firebase service-account key at backup/service-account-key.json
#      (generate one from the Firebase Console → Project Settings → Service Accounts)
#
# Output: backup/snapshots/backup_<timestamp>.json
#
set -euo pipefail

# ── Constants ────────────────────────────────────────────────────────────────
EXPECTED_PROJECT="geogessr-a4adc"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
BACKUP_DIR="${SCRIPT_DIR}/backup"
SNAPSHOTS_DIR="${BACKUP_DIR}/snapshots"
SERVICE_ACCOUNT_KEY="${BACKUP_DIR}/service-account-key.json"

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
info "Starting Firestore backup for project '${EXPECTED_PROJECT}'"

# 1. Verify Node.js is installed
if ! command -v node &>/dev/null; then
  die "Node.js is not installed. Install it from https://nodejs.org/"
fi

# 2. Verify we are in the correct repository
if [ ! -f "${SCRIPT_DIR}/firebase.json" ]; then
  die "firebase.json not found in ${SCRIPT_DIR}. Are you in the right repo?"
fi

# 3. Verify the Firebase project matches
RC_PROJECT="$(python3 -c "import json; print(json.load(open('${SCRIPT_DIR}/.firebaserc'))['projects']['default'])" 2>/dev/null)" || true
if [ "${RC_PROJECT}" != "${EXPECTED_PROJECT}" ]; then
  die "Safety check failed: .firebaserc default project is '${RC_PROJECT}', expected '${EXPECTED_PROJECT}'."
fi

# 4. Verify the service-account key exists
if [ ! -f "${SERVICE_ACCOUNT_KEY}" ]; then
  die "Service-account key not found at ${SERVICE_ACCOUNT_KEY}.
     Generate one from: Firebase Console → Project Settings → Service Accounts → Generate New Private Key
     Then save it as: backup/service-account-key.json"
fi

# 5. Verify the service-account key belongs to the correct project
SA_PROJECT="$(python3 -c "import json; print(json.load(open('${SERVICE_ACCOUNT_KEY}'))['project_id'])" 2>/dev/null)" || true
if [ "${SA_PROJECT}" != "${EXPECTED_PROJECT}" ]; then
  die "Service-account key belongs to project '${SA_PROJECT}', expected '${EXPECTED_PROJECT}'."
fi

info "Confirmed project: ${EXPECTED_PROJECT}"

# ── Install dependencies ────────────────────────────────────────────────────
if [ ! -d "${BACKUP_DIR}/node_modules" ]; then
  info "Installing backup dependencies …"
  (cd "${BACKUP_DIR}" && npm install --silent)
fi

# ── Run backup ──────────────────────────────────────────────────────────────
info "Exporting Firestore data …"
export GOOGLE_APPLICATION_CREDENTIALS="${SERVICE_ACCOUNT_KEY}"
node "${BACKUP_DIR}/firestore_backup.js" "${SNAPSHOTS_DIR}"

echo ""
info "Backup complete! Snapshots are stored in: ${SNAPSHOTS_DIR}"
