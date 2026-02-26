#!/usr/bin/env bash
#
# restore_backup.sh — Restore a local Firestore JSON snapshot back to Firebase.
#
# Usage:
#   ./restore_backup.sh                         # interactive — pick from available snapshots
#   ./restore_backup.sh backup/snapshots/backup_2025-01-15T12-00-00-000Z.json
#
# Prerequisites:
#   1. Node.js installed
#   2. A Firebase service-account key at backup/service-account-key.json
#
# NOTE: This performs a MERGE write — existing documents not in the backup
#       are left untouched.  No data is deleted.
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
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; CYAN=''; NC=''
fi

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
die()   { error "$@"; exit 1; }

# ── Pre-flight checks ───────────────────────────────────────────────────────
info "Firestore restore for project '${EXPECTED_PROJECT}'"

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

# ── Determine which backup file to restore ──────────────────────────────────
BACKUP_FILE="${1:-}"

if [ -z "${BACKUP_FILE}" ]; then
  # No argument supplied — list available snapshots and let the user pick
  if [ ! -d "${SNAPSHOTS_DIR}" ] || [ -z "$(ls -A "${SNAPSHOTS_DIR}" 2>/dev/null)" ]; then
    die "No snapshots found in ${SNAPSHOTS_DIR}. Run take_backup.sh first."
  fi

  echo ""
  info "Available snapshots:"
  echo ""

  mapfile -t SNAPSHOTS < <(ls -1t "${SNAPSHOTS_DIR}"/*.json 2>/dev/null)

  if [ ${#SNAPSHOTS[@]} -eq 0 ]; then
    die "No .json backup files found in ${SNAPSHOTS_DIR}."
  fi

  for i in "${!SNAPSHOTS[@]}"; do
    local_file="${SNAPSHOTS[$i]}"
    size="$(du -h "${local_file}" | cut -f1 | xargs)"
    name="$(basename "${local_file}")"
    echo -e "  ${CYAN}[$((i + 1))]${NC}  ${name}  (${size})"
  done

  echo ""
  read -rp "Select a snapshot to restore (1-${#SNAPSHOTS[@]}): " choice

  if ! [[ "${choice}" =~ ^[0-9]+$ ]] || [ "${choice}" -lt 1 ] || [ "${choice}" -gt "${#SNAPSHOTS[@]}" ]; then
    die "Invalid selection: ${choice}"
  fi

  BACKUP_FILE="${SNAPSHOTS[$((choice - 1))]}"
fi

# Resolve to absolute path
BACKUP_FILE="$(cd "$(dirname "${BACKUP_FILE}")" && pwd)/$(basename "${BACKUP_FILE}")"

if [ ! -f "${BACKUP_FILE}" ]; then
  die "Backup file not found: ${BACKUP_FILE}"
fi

info "Selected backup: $(basename "${BACKUP_FILE}")"

# ── Safety confirmation ─────────────────────────────────────────────────────
echo ""
warn "⚠  You are about to restore data to the LIVE Firestore database for '${EXPECTED_PROJECT}'."
warn "   This will overwrite documents that exist in both the backup and the database."
echo ""
read -rp "Type 'yes' to confirm: " confirm

if [ "${confirm}" != "yes" ]; then
  info "Restore cancelled."
  exit 0
fi

# ── Install dependencies ────────────────────────────────────────────────────
if [ ! -d "${BACKUP_DIR}/node_modules" ]; then
  info "Installing backup dependencies …"
  (cd "${BACKUP_DIR}" && npm install --silent)
fi

# ── Run restore ─────────────────────────────────────────────────────────────
info "Restoring Firestore data …"
export GOOGLE_APPLICATION_CREDENTIALS="${SERVICE_ACCOUNT_KEY}"
node "${BACKUP_DIR}/firestore_restore.js" "${BACKUP_FILE}"

echo ""
info "Restore complete!"
