#!/usr/bin/env bash
# Generate fake data in ./data_test (in the directory you run this from) and
# start Shipyard in dev mode with that folder open.
#
# Usage:
#   scripts/dev-test.sh                 # fresh random data
#   scripts/dev-test.sh --seed 42       # repeatable data
#   scripts/dev-test.sh --tasks 20      # any generate-test-data.py option works
#   SKIP_GENERATE=1 scripts/dev-test.sh # reuse existing ./data_test as-is
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DATA_DIR="$(pwd)/data_test"

# Make cargo available if rustup was installed but the shell hasn't sourced it.
if ! command -v cargo >/dev/null 2>&1 && [ -f "$HOME/.cargo/env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.cargo/env"
fi

if [ "${SKIP_GENERATE:-0}" != "1" ]; then
  python3 "$SCRIPT_DIR/generate-test-data.py" --out "$DATA_DIR" "$@"
fi

if [ ! -d "$PROJECT_DIR/node_modules" ]; then
  (cd "$PROJECT_DIR" && npm install)
fi

echo "Starting Shipyard with data folder: $DATA_DIR"
cd "$PROJECT_DIR"
SHIPYARD_DATA_DIR="$DATA_DIR" exec npm run dev
