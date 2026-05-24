# GSD Context Used

- run_id: `20260520T225839Z-57944`
- contour: `feature/process-analysis-session-frontend-thin-client-switch-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-20T22:59:10Z`

## Commands

### command -v gsd
```
/opt/processmap-test/bin/gsd
```

### gsd help/status
```
Error: Usage: gsd-tools <command> [args] [--raw] [--pick <field>] [--cwd <path>] [--ws <name>]
Commands: state, resolve-model, find-phase, commit, verify-summary, verify, frontmatter, template, generate-slug, current-timestamp, list-todos, verify-path-exists, config-ensure-section, config-new-project, init, workstream, docs-init
```

### gsd state
```
model_profile=balanced
commit_docs=true
branching_strategy=none
phase_branch_template=gsd/phase-{phase}-{slug}
milestone_branch_template=gsd/{milestone}-{slug}
parallelization=true
research=true
plan_checker=true
verifier=true
config_exists=false
roadmap_exists=false
state_exists=false```

### available gsd skills
```
/root/.codex/skills/gsd-add-backlog
/root/.codex/skills/gsd-add-phase
/root/.codex/skills/gsd-add-tests
/root/.codex/skills/gsd-add-todo
/root/.codex/skills/gsd-ai-integration-phase
/root/.codex/skills/gsd-analyze-dependencies
/root/.codex/skills/gsd-audit-fix
/root/.codex/skills/gsd-audit-milestone
/root/.codex/skills/gsd-audit-uat
/root/.codex/skills/gsd-autonomous
/root/.codex/skills/gsd-check-todos
/root/.codex/skills/gsd-cleanup
/root/.codex/skills/gsd-code-review
/root/.codex/skills/gsd-code-review-fix
/root/.codex/skills/gsd-complete-milestone
/root/.codex/skills/gsd-debug
/root/.codex/skills/gsd-discuss-phase
/root/.codex/skills/gsd-do
/root/.codex/skills/gsd-docs-update
/root/.codex/skills/gsd-eval-review
/root/.codex/skills/gsd-execute-phase
/root/.codex/skills/gsd-explore
/root/.codex/skills/gsd-extract_learnings
/root/.codex/skills/gsd-fast
/root/.codex/skills/gsd-forensics
/root/.codex/skills/gsd-from-gsd2
/root/.codex/skills/gsd-graphify
/root/.codex/skills/gsd-health
/root/.codex/skills/gsd-help
/root/.codex/skills/gsd-import
```

## Planner Notes

- GSD state shows `config_exists=false`, `roadmap_exists=false`, `state_exists=false` — no active GSD milestone tracking for this contour.
- GSD skills are available but not invoked for this planning-only step; local filesystem tracking via `.planning/contours/` is sufficient.
- No specific GSD skill needed; contour follows established ProcessMap agent pipeline (Agent 1→2→3→4).
