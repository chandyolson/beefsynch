#!/usr/bin/env bash
# Convenience wrapper for `npm run schema:snapshot`. Run from the repo root.
set -euo pipefail
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."
exec npm run schema:snapshot "$@"
