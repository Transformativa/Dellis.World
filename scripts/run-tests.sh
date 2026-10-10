#!/usr/bin/env bash
# One command to check everything before a release.
#   ./scripts/run-tests.sh          data + search tests, and the app type check (about 30 seconds)
#   ./scripts/run-tests.sh --full   also builds the phone app bundle to prove it compiles (about 2 minutes)
#   ./scripts/run-tests.sh --release everything above plus the look-and-feel check (screenshots compared with the saved ones). Run this before every republish.
set -u
cd "$(dirname "$0")/.."
FULL=0; VISUAL=0
[ "${1:-}" = "--full" ] && FULL=1
[ "${1:-}" = "--release" ] && { FULL=1; VISUAL=1; }
FAILED=()
step() { # step "name" command...
  local name="$1"; shift
  printf '\n== %s ==\n' "$name"
  if "$@"; then printf 'PASS  %s\n' "$name"; else printf 'FAIL  %s\n' "$name"; FAILED+=("$name"); fi
}

step "Data, search and agreements tests" node --test test/*.test.mjs
step "Source freshness (faith numbers checked within a year)" node scripts/check-sources.mjs
if [ -d mobile/node_modules ]; then
  step "Copy data into the app" node mobile/scripts/sync-data.mjs
  step "App type check" bash -c 'cd mobile && npx tsc --noEmit'
  if [ $FULL = 1 ]; then
    step "App bundle builds (iOS)" bash -c 'cd mobile && EXPO_OFFLINE=1 CI=1 npx expo export --platform ios --output-dir "$(mktemp -d)"'
    step "App bundle builds (Android)" bash -c 'cd mobile && EXPO_OFFLINE=1 CI=1 npx expo export --platform android --output-dir "$(mktemp -d)"'
  fi
  if [ $VISUAL = 1 ]; then step "Look and feel (screens, fonts, colours, layout)" node scripts/visual-check.mjs; fi
else
  printf '\nSkipping app checks: run "cd mobile && npm install" first.\n'
fi

printf '\n=========================\n'
if [ ${#FAILED[@]} -eq 0 ]; then echo "ALL CHECKS PASSED"; exit 0; fi
echo "FAILED:"; printf '  - %s\n' "${FAILED[@]}"; exit 1
