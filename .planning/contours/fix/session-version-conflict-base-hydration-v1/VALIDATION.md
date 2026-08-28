# FIX: Session Version Conflict — VALIDATION

**Contour:** `fix/session-version-conflict-base-hydration-v1`

---

## 1. Local functional validation

Could **not** be completed in this environment:

- Host `node`/`npm` are unavailable.
- Docker `node:20-alpine` can run isolated `.mjs` tests but cannot build the Vite frontend or run `docker compose` because the project `node_modules` are not installed inside the container and the host has no package manager to install them.

Therefore the following checklist from the fix prompt remains **pending** until the branch is built on a machine with `node_modules` / CI:

- [ ] `docker compose up -d`: create session → edit diagram → switch to «Аналитика» → save succeeds, no 409.
- [ ] Two+ sessions in one project: edit each in turn → no cross-session 409; sibling `updated_at` does not change.
- [ ] Two tabs on one session → correct conflict modal with **non-zero** server version.
- [ ] Regression: manual save, autosave, restore version, subprocess→parent sync, BPMN version publish, property edit.
- [ ] Stage smoke: `./verify-deploy.sh` → `MATCH`.

---

## 2. What was validated

- Targeted unit tests pass (see `TESTS.md`).
- Syntax checks pass for changed `.js` files.
- `ProcessStage` version-context structural tests pass, confirming the `null`-vs-`0` change does not break existing consumers.

---

## 3. Stage / prod gates

- **Merge:** blocked pending explicit user approve.
- **Deploy:** blocked pending merge + stage verify + manual prod deploy by user.
