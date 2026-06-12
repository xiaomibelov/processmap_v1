#!/bin/bash
cd /root/processmap_v1/vault
if [ -n "$(git status --porcelain)" ]; then
  git add -A
  git commit -m "auto: $(date -u +%Y-%m-%dT%H:%M:%SZ) | $(git diff --cached --name-only | wc -l) files"
  git push origin main 2>/dev/null || echo "push failed, will retry"
fi
