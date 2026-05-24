#!/bin/bash
# obsidian-write.sh — Write markdown notes directly to Obsidian vault
# Vault path: /srv/obsidian/project-atlas/ProcessMap
#
# Usage:
#   ./obsidian-write.sh handoff  "Title of the handoff"   "path/to/file.md"
#   ./obsidian-write.sh evidence "Title of evidence"      "path/to/file.md"
#   ./obsidian-write.sh decision "Title of decision"      "path/to/file.md"
#   ./obsidian-write.sh task     "Title of task"          "path/to/file.md"
#
# The script reads markdown content from stdin if "-" is passed as the file arg,
# otherwise reads from the given file path.

set -euo pipefail

VAULT_ROOT="/srv/obsidian/project-atlas/ProcessMap"
TYPE="${1:-}"
TITLE="${2:-}"
SRC="${3:-}"

if [[ -z "$TYPE" || -z "$TITLE" ]]; then
  echo "Usage: $0 <handoff|evidence|decision|task|runtime|audit> <title> <file.md or ->"
  exit 1
fi

# Map type to folder
FOLDER=""
case "$TYPE" in
  handoff)   FOLDER="HANDOFF" ;;
  evidence)  FOLDER="Evidence" ;;
  decision)  FOLDER="Decisions" ;;
  task)      FOLDER="Runtime" ;;
  runtime)   FOLDER="Runtime" ;;
  audit)     FOLDER="Audits" ;;
  backlog)   FOLDER="Backlog" ;;
  contour)   FOLDER="Contours" ;;
  prompt)    FOLDER="Prompts" ;;
  rag)       FOLDER="RAG" ;;
  *)
    echo "Unknown type: $TYPE"
    exit 1
    ;;
esac

# Build filename: YYYY-MM-DD - slug.md
DATE_PREFIX=$(date +%Y-%m-%d)
SLUG=$(echo "$TITLE" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g' | sed 's/--*/-/g' | sed 's/^-//;s/-$//')
FILENAME="${DATE_PREFIX} - ${TITLE}.md"
DEST_DIR="$VAULT_ROOT/$FOLDER"
DEST="$DEST_DIR/$FILENAME"

mkdir -p "$DEST_DIR"

# Read content
if [[ "$SRC" == "-" ]]; then
  CONTENT=$(cat)
elif [[ -f "$SRC" ]]; then
  CONTENT=$(cat "$SRC")
else
  echo "Source not found: $SRC (use '-' for stdin)"
  exit 1
fi

# Write file
cat > "$DEST" <<EOF
# ${TITLE}

**Type:** ${TYPE}  
**Date:** ${DATE_PREFIX}  
**Source:** Kimi CLI / processmap-test

---

${CONTENT}

---

*Written by agent at $(date -Iseconds)*
EOF

echo "OK: $DEST"
