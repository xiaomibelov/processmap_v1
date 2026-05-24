# GSD Context Used

Контур: `feature/process-properties-registry-backend-source-truth-v1`  
Run ID: `20260520T193813Z-39871`

## Commands

```bash
command -v gsd
# /opt/processmap-test/bin/gsd

gsd 2>&1 | head -30
# Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
# model_profile=balanced
# commit_docs=true
# branching_strategy=none
# parallelization=true
# research=true
# plan_checker=true
# verifier=true
# config_exists=false
# roadmap_exists=false
# state_exists=false

gsd state --raw 2>/dev/null || gsd state 2>/dev/null || true
# (no output; state_exists=false)

find "/root/.codex/skills" -maxdepth 1 -type d -name 'gsd-*' | sort | head -15
# 15 skills listed (gsd-add-backlog through gsd-check-todos)
```

## GSD discipline status

- GSD command available at `/opt/processmap-test/bin/gsd`.
- No active GSD workspace/state/roadmap for this runtime root.
- Planner will rely on contour directory discipline (`.planning/contours/`) rather than GSD milestone tracking.
- Skills available for future use if executor or reviewer chooses to invoke them.
