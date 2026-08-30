#!/usr/bin/env bash
set -euo pipefail

# Local mirror for review/storage-domain-split-postmerge artifacts into the server-backup Obsidian mirror.

REPO_ROOT="/Users/mac/agents_place/kimi_PM/processmap_v1_main_clone"
VAULT="/Users/mac/agents_place/kimi_PM/server-backup/srv/obsidian/project-atlas"
CID="review/storage-domain-split-postmerge"
SRC="$REPO_ROOT/.planning/contours/$CID"
DEST="$VAULT/ProcessMap/AgentReports/$CID"

if [ ! -d "$VAULT" ]; then
  echo "MIRROR_ERROR: Obsidian vault missing: $VAULT"
  exit 1
fi

mkdir -p "$DEST"

copied=0
for f in VERDICT.md EVIDENCE.md; do
  if [ -f "$SRC/$f" ]; then
    cp -p "$SRC/$f" "$DEST/$f"
    copied=$((copied + 1))
    echo "MIRRORED: $f"
  else
    echo "MISSING: $f"
  fi
done

{
  echo "# ProcessMap Agent Report Mirror"
  echo
  echo "Updated: $(date -Iseconds)"
  echo "Contour: $CID"
  echo
  echo "## Source"
  echo
  echo "\`\`\`text"
  echo "$SRC"
  echo "\`\`\`"
  echo
  echo "## Mirror"
  echo
  echo "\`\`\`text"
  echo "$DEST"
  echo "\`\`\`"
  echo
  echo "## Files"
  echo
  find "$DEST" -maxdepth 1 -type f -print | sed 's|.*/|- |' | sort
} > "$DEST/INDEX.md"

date -Iseconds > "$DEST/MIRROR_UPDATED_AT"

echo "MIRROR_DONE: $copied file(s) copied to $DEST"
