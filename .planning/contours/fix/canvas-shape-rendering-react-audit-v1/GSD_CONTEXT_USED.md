# GSD Context Used

- run_id: `20260529T000236Z-27528`
- contour: `fix/canvas-shape-rendering-react-audit-v1`
- generated_by: Agent 1 / Planner
- generated_at: 2026-05-29T00:05:00Z

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
state_exists=false
```

### available gsd skills
```
/home/deploy/.codex/skills/gsd-add-backlog
/home/deploy/.codex/skills/gsd-add-phase
/home/deploy/.codex/skills/gsd-add-tests
/home/deploy/.codex/skills/gsd-add-todo
/home/deploy/.codex/skills/gsd-ai-integration-phase
/home/deploy/.codex/skills/gsd-analyze-dependencies
/home/deploy/.codex/skills/gsd-audit-fix
/home/deploy/.codex/skills/gsd-audit-milestone
/home/deploy/.codex/skills/gsd-audit-uat
/home/deploy/.codex/skills/gsd-autonomous
/home/deploy/.codex/skills/gsd-check-todos
/home/deploy/.codex/skills/gsd-cleanup
/home/deploy/.codex/skills/gsd-code-review
/home/deploy/.codex/skills/gsd-code-review-fix
/home/deploy/.codex/skills/gsd-complete-milestone
/home/deploy/.codex/skills/gsd-debug
/home/deploy/.codex/skills/gsd-discuss-phase
/home/deploy/.codex/skills/gsd-do
/home/deploy/.codex/skills/gsd-docs-update
/home/deploy/.codex/skills/gsd-eval-review
/home/deploy/.codex/skills/gsd-execute-phase
/home/deploy/.codex/skills/gsd-explore
/home/deploy/.codex/skills/gsd-extract_learnings
/home/deploy/.codex/skills/gsd-fast
/home/deploy/.codex/skills/gsd-forensics
/home/deploy/.codex/skills/gsd-from-gsd2
/home/deploy/.codex/skills/gsd-graphify
/home/deploy/.codex/skills/gsd-health
/home/deploy/.codex/skills/gsd-help
/home/deploy/.codex/skills/gsd-import
```

## Decisions
- GSD wrapper available at `/opt/processmap-test/bin/gsd`.
- No GSD project config/roadmap/state exists for this workspace (`config_exists=false`, `roadmap_exists=false`, `state_exists=false`).
- GSD skills available but contour planning proceeds with direct artifact creation (PLAN.md, STATE.json, prompts) per ProcessMap agent contract.
- `gsd-fast` skill may be used by Agent 2 for trivial inline tasks if needed.
