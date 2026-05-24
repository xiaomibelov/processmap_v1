# GSD Context Used

**Run ID:** `20260520T191945Z-37206`

## Commands
```bash
command -v gsd
# /opt/processmap-test/bin/gsd

gsd 2>&1 | head -30
# Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
# Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init

gsd state --raw 2>/dev/null || gsd state 2>/dev/null || true
# model_profile=balanced
# commit_docs=true
# branching_strategy=none
# phase_branch_template=gsd/phase-{phase}-{slug}
# milestone_branch_template=gsd/{milestone}-{slug}
# parallelization=true
# research=true
# plan_checker=true
# verifier=true
# config_exists=false
# roadmap_exists=false
# state_exists=false

find "/root/.codex/skills" -maxdepth 1 -type d -name 'gsd-*' | sort | head -15
# 15 gsd skills available (add-backlog, add-phase, add-tests, add-todo, ai-integration-phase, analyze-dependencies, audit-fix, audit-milestone, audit-uat, autonomous, check-todos, cleanup, code-review, code-review-fix, complete-milestone)
```

## Assessment
- GSD tooling is available but no active roadmap/phase state exists for this contour.
- Planner will use direct file writes rather than GSD phase scaffolding because this is a bounded agent contour, not a GSD milestone phase.
