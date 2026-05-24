#!/usr/bin/env bash
set -euo pipefail

ROOT="/opt/processmap-test"
GSD_BIN="$ROOT/bin/gsd"
GSD_TOOLS="/root/.codex/get-shit-done/bin/gsd-tools.cjs"
SKILLS_DIR="/root/.codex/skills"
AGENTS_DIR="/root/.codex/agents"

cd "$ROOT"
export PATH="$ROOT/bin:$PATH"
export PROCESSMAP_GSD_BIN="$GSD_BIN"
export PROCESSMAP_CODEX_GSD_TOOLS="$GSD_TOOLS"
export PROCESSMAP_GSD_SKILLS_DIR="$SKILLS_DIR"
export PROCESSMAP_GSD_AGENTS_DIR="$AGENTS_DIR"

echo "=== ProcessMap GSD Status ==="
echo "Root: $ROOT"
echo "PATH command gsd: $(command -v gsd || echo MISSING)"
echo "Expected wrapper: $GSD_BIN"
echo "Codex GSD tools: $GSD_TOOLS"
echo "Node: $(command -v node || echo MISSING)"
node -v 2>/dev/null || true

echo
echo "=== Wrapper ==="
if [ -x "$GSD_BIN" ]; then
  ls -la "$GSD_BIN"
else
  echo "MISSING_OR_NOT_EXECUTABLE: $GSD_BIN"
fi

if [ -f "$GSD_TOOLS" ]; then
  ls -la "$GSD_TOOLS"
else
  echo "MISSING: $GSD_TOOLS"
fi

echo
echo "=== GSD Usage Probe ==="
set +e
gsd >/tmp/pm-gsd-status-usage.out 2>&1
rc=$?
set -e
echo "gsd exit: $rc"
head -40 /tmp/pm-gsd-status-usage.out || true

echo
echo "=== Skills ==="
if [ -d "$SKILLS_DIR" ]; then
  echo "Skills dir: $SKILLS_DIR"
  find "$SKILLS_DIR" -maxdepth 1 -type d -name 'gsd-*' | sort | head -50
  echo "Skills count: $(find "$SKILLS_DIR" -maxdepth 1 -type d -name 'gsd-*' | wc -l | tr -d ' ')"
else
  echo "MISSING: $SKILLS_DIR"
fi

echo
echo "=== Agents ==="
if [ -d "$AGENTS_DIR" ]; then
  echo "Agents dir: $AGENTS_DIR"
  find "$AGENTS_DIR" -maxdepth 1 -type f -name 'gsd-*' | sort | head -50
  echo "Agent files count: $(find "$AGENTS_DIR" -maxdepth 1 -type f -name 'gsd-*' | wc -l | tr -d ' ')"
else
  echo "MISSING: $AGENTS_DIR"
fi

echo
echo "=== Known Global Symlink Warning ==="
for p in /usr/local/bin/gsd /usr/local/bin/gsd-sdk /usr/local/bin/get-shit-done-cc /root/.local/bin/gsd /root/.local/bin/gsd-sdk /root/.local/bin/get-shit-done-cc; do
  if [ -e "$p" ] || [ -L "$p" ]; then
    printf '%s -> ' "$p"
    readlink "$p" 2>/dev/null || echo '<not-symlink>'
    target="$(readlink -f "$p" 2>/dev/null || true)"
    if [ -n "$target" ] && [ -e "$target" ]; then
      echo "  target: $target"
    else
      echo "  target missing"
    fi
  else
    echo "$p: missing"
  fi
done
