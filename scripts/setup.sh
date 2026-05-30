#!/usr/bin/env bash
# scripts/setup.sh — one-shot setup for fresh clone
#
# Does:
#   1. git submodule init/update (pulls vendor/agent-sessions-cli)
#   2. find Python >=3.10
#   3. create vendor/agent-sessions-cli/.venv
#   4. pip install -e vendor/agent-sessions-cli
#
# Idempotent: safe to re-run.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
VENDOR_DIR="$REPO_ROOT/vendor/agent-sessions-cli"

cyan() { printf '\033[36m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }

cd "$REPO_ROOT"

cyan "→ Step 1/4: Initialize submodules"
git submodule update --init --recursive
green "  ✓ submodule ready: $VENDOR_DIR"

cyan "→ Step 2/4: Find Python >=3.10"
PYTHON=""
for cand in python3.13 python3.12 python3.11 python3.10 python3; do
  if command -v "$cand" >/dev/null 2>&1; then
    v=$("$cand" -c 'import sys; print(f"{sys.version_info.major}.{sys.version_info.minor}")' 2>/dev/null || echo "0.0")
    major=$(echo "$v" | cut -d. -f1)
    minor=$(echo "$v" | cut -d. -f2)
    if [ "$major" -ge 3 ] && [ "$minor" -ge 10 ]; then
      PYTHON="$cand"
      green "  ✓ found: $cand ($v)"
      break
    fi
  fi
done

if [ -z "$PYTHON" ]; then
  red "  ✗ no Python >=3.10 found. Install with:"
  red "      brew install python@3.12"
  red "    or download from https://www.python.org/downloads/"
  exit 1
fi

cyan "→ Step 3/4: Create venv at $VENDOR_DIR/.venv"
if [ -d "$VENDOR_DIR/.venv" ]; then
  green "  ✓ venv exists, skip create"
else
  "$PYTHON" -m venv "$VENDOR_DIR/.venv"
  green "  ✓ venv created"
fi

cyan "→ Step 4/4: pip install -e (editable install)"
"$VENDOR_DIR/.venv/bin/pip" install --upgrade pip --quiet
"$VENDOR_DIR/.venv/bin/pip" install -e "$VENDOR_DIR" --quiet
green "  ✓ agent-sessions-cli installed"

cyan ""
cyan "→ Verifying..."
BIN="$VENDOR_DIR/.venv/bin/agent-sessions"
if [ -x "$BIN" ]; then
  VERSION=$("$BIN" --version 2>&1 || echo "(version probe failed)")
  green "  ✓ $BIN"
  green "  ✓ $VERSION"
else
  red "  ✗ expected binary not found: $BIN"
  exit 1
fi

cyan ""
green "Setup complete!"
cyan ""
cyan "Next steps:"
cyan "  1. cp packages/cli/config-example.yaml local/skill-recall-config.yaml"
cyan "  2. echo 'MINIMAX_API_KEY=sk-xxx' >> .env"
cyan "  3. pnpm install && pnpm build"
cyan "  4. pnpm doctor"
