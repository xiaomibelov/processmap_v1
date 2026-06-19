# GSD Context Used — audit/prod-runtime-source-truth-20260615

**GSD binary:** `/opt/processmap-test/bin/gsd`
**Skills directory:** `/root/.codex/skills`

**Commands:**
```bash
command -v gsd
# /opt/processmap-test/bin/gsd

ls /root/.codex/skills | grep '^gsd-' | head -10
# gsd-add-backlog, gsd-add-phase, gsd-add-tests, gsd-add-todo, ...
```

**Usage:** GSD skills were not invoked for this retroactive audit. The task was executed directly after user approval. Future ProcessMap work will route through the appropriate GSD skill per `processmap-agent` discipline.
