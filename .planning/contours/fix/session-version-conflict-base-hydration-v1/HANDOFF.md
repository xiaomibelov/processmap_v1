# FIX: Session Version Conflict — HANDOFF

**Contour:** `fix/session-version-conflict-base-hydration-v1`  
**Status:** `READY_FOR_REVIEW`  
**Branch:** `fix/session-version-conflict-base-hydration-v1`  
**HEAD:** `2ae25dcd72578c2fdc6fe6ad1f9652acb8ea05ac` (HEAD after fix commit)  
**PR:** https://github.com/xiaomibelov/processmap_v1/pull/853  
**Obsidian mirror:** skipped (`/opt/processmap-test` and `/srv/obsidian` are not mounted in this environment)  

---

## 1. What was done

Implemented the defensive frontend fix approved after audit `audit/session-conflict-2026-08-28`:

1. **H6 investigation** (cross-session pollution)
   - Backend: no mass `UPDATE sessions` writer found; all session writes are single-row and CAS-guarded.
   - Frontend tracker: `casVersionTracker.js` is keyed by `sessionId`; `external`/`draft` getters are context-bound to the active session.
   - Background loops: no global scheduler iterating multiple sessions found.
   - Verdict: H6 not confirmed as a code defect; symptom likely frontend list/cache artifact or user interpretation of relative timestamps.

2. **Core fix**
   - `createBpmnPersistence.js`: `resolveBaseDiagramStateVersion` returns `null` (not `0`) when tracker/external/draft are all missing; `saveRaw` aborts with `missing_base_version` / `needsHydration` instead of sending `base_diagram_state_version: 0`.
   - `useProcessTabs.js`: `flushBpmnTab` now hydrates the base version via `apiGetSession` before forcing a tab-switch save.
   - `ProcessStage.jsx`: `diagramStateVersionRef` is now `null` when uninitialized, distinguishing "not loaded" from "server version 0".

3. **Tests**
   - Added/updated unit tests in `createBpmnPersistence.test.mjs` and `useProcessTabs.cas-base-propagation.test.mjs`.
   - All targeted test suites pass (14 + 7 + 3 + 6 = 30 tests).

---

## 2. What is proven

- Code prevents sending `base_diagram_state_version: 0` when the version is unknown.
- Tab-switch flush will re-hydrate before save if the base version is missing.
- CAS tracker is per-session.
- Existing version-context wiring remains intact (regression tests pass).

---

## 3. What is NOT proven / remains

- **Prod evidence gate:** exact 409 response/request bodies, DB rows for `ae4092605c`, and backend logs were not provided. Fix is defensive; PR should be marked **PARTIAL**.
- **Local docker validation:** could not run `docker compose up` / `./verify-deploy.sh` because host `node`/`npm` are unavailable and the Docker test runner lacks `node_modules`.
- **401 authorization issues** reported by the user are explicitly out of scope for this contour.

---

## 4. Next steps (require user approve)

1. Review PR.
2. If approved, merge to `main` → stage auto-deploy.
3. Run `./verify-deploy.sh` on stage; confirm `MATCH`.
4. Manual prod deploy by user if stage validation passes.
5. If prod evidence (network payload/response, DB) becomes available, update `HYPOTHESIS.md` / `FINDINGS.md` and re-evaluate whether additional fixes are needed.
