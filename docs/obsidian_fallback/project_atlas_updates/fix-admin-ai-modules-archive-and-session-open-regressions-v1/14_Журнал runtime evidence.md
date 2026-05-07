# 2026-05-07 - fix/admin-ai-modules-archive-and-session-open-regressions-v1

Validation evidence:

```bash
PYTHONPATH=backend python -m unittest backend.tests.test_ai_prompt_registry_seeds backend.tests.test_ai_prompt_registry_foundation backend.tests.test_ai_module_catalog_api
node --test src/features/admin/pages/AdminAiModulesPage.test.mjs src/features/process/hooks/useProcessTabs.session-entry-tab.test.mjs src/features/explorer/workspaceOpenAffordance.source.test.mjs
git diff --check
npm --prefix frontend run build
```

Results:

- backend focused tests: PASS, 16 tests.
- frontend targeted tests: PASS, 12 tests.
- `git diff --check`: PASS.
- frontend build: PASS.

Runtime repro evidence:

- Before fix: archive active `seed_ai_product_actions_suggest_v2`; next `seed_existing_ai_prompts()` raised `ValueError: archived prompt cannot be activated`.
- After fix: same archive leaves no active prompt and repeat seed returns `ok: true` with the archived seed in `skipped`.

Notes:

- `npm --prefix frontend ci` was required in the clean worktree and reported existing audit warnings: 4 moderate, 3 high.
- An accidental `npm exec node --test ...` attempted to install `node@26`; it was stopped and replaced with direct `node --test ...`.
- frontend `node --test` emits a Vite/esbuild shutdown line `The build was canceled`, while TAP exits PASS 12/12.
