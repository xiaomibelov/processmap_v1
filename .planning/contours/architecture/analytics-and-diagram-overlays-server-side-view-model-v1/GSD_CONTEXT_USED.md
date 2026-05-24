# GSD context used

Run ID: `20260519T090224Z-17699`

## Команды

```bash
command -v gsd
gsd
gsd state --raw
find "/root/.codex/skills" -maxdepth 1 -type d -name 'gsd-*' | sort | head -15
```

## Результат

- `command -v gsd` -> `/opt/processmap-test/bin/gsd`
- `gsd` без аргументов вернул usage для `gsd-tools <command>`.
- `gsd state --raw`:
  - `model_profile=balanced`
  - `commit_docs=true`
  - `branching_strategy=none`
  - `parallelization=true`
  - `research=true`
  - `plan_checker=true`
  - `verifier=true`
  - `config_exists=false`
  - `roadmap_exists=false`
  - `state_exists=false`
- Найдены GSD skills, первые 15:
  - `/root/.codex/skills/gsd-add-backlog`
  - `/root/.codex/skills/gsd-add-phase`
  - `/root/.codex/skills/gsd-add-tests`
  - `/root/.codex/skills/gsd-add-todo`
  - `/root/.codex/skills/gsd-ai-integration-phase`
  - `/root/.codex/skills/gsd-analyze-dependencies`
  - `/root/.codex/skills/gsd-audit-fix`
  - `/root/.codex/skills/gsd-audit-milestone`
  - `/root/.codex/skills/gsd-audit-uat`
  - `/root/.codex/skills/gsd-autonomous`
  - `/root/.codex/skills/gsd-check-todos`
  - `/root/.codex/skills/gsd-cleanup`
  - `/root/.codex/skills/gsd-code-review`
  - `/root/.codex/skills/gsd-code-review-fix`
  - `/root/.codex/skills/gsd-complete-milestone`

## GSD discipline applied

- Scope bounded to architecture/planning artifacts only.
- No product code, schema, package, PR, merge, or deploy.
- Worker split is parallel and independent.
- Review gate is explicit and fail-closed.
- Dirty workspace and non-canonical checkout recorded as risk, not modified.
