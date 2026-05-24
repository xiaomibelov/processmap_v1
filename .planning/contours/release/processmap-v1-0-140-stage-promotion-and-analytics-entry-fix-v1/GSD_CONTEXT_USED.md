# GSD Context Used

- run_id: `20260521T111303Z-90132`
- contour: `release/processmap-v1-0-140-stage-promotion-and-analytics-entry-fix-v1`
- generated_by: `processmap-agent-pane.sh`
- generated_at: `2026-05-21T11:13:27Z`

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

## Planner Decision

- No specific GSD skill invocation required for this stage-promotion contour.
- GSD state shows `config_exists=false`, `roadmap_exists=false`, `state_exists=false` — project is not using GSD roadmap tracking for this contour.
- Executor will follow AGENTS.md §7 release flow directly.
