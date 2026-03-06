#!/usr/bin/env bash
#
# merge-and-deploy.sh — Fetch, merge main into alex-develop, push, and deploy
#
set -euo pipefail

# ── Colours ─────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; BLUE='\033[0;34m'; NC='\033[0m'
else
  RED=''; GREEN=''; YELLOW=''; BLUE=''; NC=''
fi

info()  { echo -e "${GREEN}[INFO]${NC}  $*"; }
warn()  { echo -e "${YELLOW}[WARN]${NC}  $*"; }
error() { echo -e "${RED}[ERROR]${NC} $*" >&2; }
step()  { echo -e "${BLUE}[STEP]${NC}  $*"; }
die()   { error "$@"; exit 1; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

# ── Pre-flight checks ───────────────────────────────────────────────────────
CURRENT_BRANCH=$(git branch --show-current)
if [ "$CURRENT_BRANCH" != "alex-develop" ]; then
  die "Must be on alex-develop branch. Currently on: $CURRENT_BRANCH"
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  warn "You have uncommitted changes:"
  git status --short
  echo ""
  # If running non-interactively, continue anyway
  if [ ! -t 0 ]; then
    info "Non-interactive mode — continuing with uncommitted changes."
  else
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
      die "Aborted."
    fi
  fi
fi

# ── Fetch ───────────────────────────────────────────────────────────────────
step "Fetching from origin..."
git fetch origin

# ── Check for new commits on main ───────────────────────────────────────────
NEW_COMMITS=$(git rev-list HEAD..origin/main --count)
if [ "$NEW_COMMITS" -eq 0 ]; then
  info "No new commits on main to merge. Nothing to do."
  exit 0
fi
info "Found $NEW_COMMITS new commit(s) on main to merge."

# ── Pull alex-develop ───────────────────────────────────────────────────────
step "Pulling latest alex-develop..."
git pull origin alex-develop --ff-only || {
  warn "Fast-forward pull failed, trying regular pull..."
  git pull origin alex-develop
}

# ── Merge main into alex-develop ────────────────────────────────────────────
step "Merging origin/main into alex-develop..."
if git merge origin/main -m "Merge remote-tracking branch 'origin/main' into alex-develop"; then
  info "Merge successful."
else
  die "Merge failed. Please resolve conflicts manually."
fi

# ── Push ────────────────────────────────────────────────────────────────────
step "Pushing alex-develop to origin..."
git push origin alex-develop

# ── Deploy ──────────────────────────────────────────────────────────────────
step "Running deploy.sh..."
"$SCRIPT_DIR/deploy.sh"

echo ""
info "All done! alex-develop is merged with main and deployed."
