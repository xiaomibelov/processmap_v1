#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$ROOT_DIR"

ENV_FILE="${1:-.env.stage}"
APP_ENV_FILE="$ENV_FILE" "$ROOT_DIR/deploy/scripts/server_smoke.sh"
