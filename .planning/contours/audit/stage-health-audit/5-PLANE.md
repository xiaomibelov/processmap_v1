# 5-Plane Analysis — Stage Health Audit

## 1. Code plane

**What the repo actually contains:**

- `GET /api/sessions/{sid}/bpmn` is read-only and has no CAS check.
- `PUT /api/sessions/{sid}/bpmn` has CAS (`_require_diagram_cas_or_409`) at `_legacy_main.py:7421`.
- Frontend BPMN autosave debounce is hard-coded to 600 ms (`createBpmnCoordinator.js:122`) and production wiring does not override it.
- BPMN stage runtime-event wiring (`wireBpmnStageRuntimeEvents.js`) adds many `eventBus.on(...)` listeners but returns no unbinder; `BpmnStage.jsx` ignores the cleanup returned by `bindSubprocessNavigationEvents`.
- Remote session sync polls every 15 s; presence every 45 s; app update every 120 s.

**Intent vs. served mismatch:**

- User expected GET /bpmn to be the 409 source, but code proves otherwise.
- User expected 10 s autosave cadence; code serves 0.6 s cadence.
- User expected listeners to be cleaned up; code leaks them on viewer/modeler re-init.

## 2. Workspace plane

**Branch/checkout:**

- Audit/fix branch: `fix/stage-health-audit`.
- Base equals `origin/main` at `75b6d6a6...`.
- Working tree is clean except for untracked `.planning` contour notes.

**Isolation:**

- The fix contour touches only backend/frontend files related to autosave, listener wiring, and polling constants.
- No overlap with the previous `status_service` CAS fix contour.

## 3. Data plane

**BPMN save side effects:**

- Each `PUT /bpmn` increments `diagram_state_version` if the XML changed.
- Each save writes a BPMN version snapshot (when conditions met) and updates `bpmn_meta`.
- Rapid autosaves create durable version spam and increase DB write load.

**Presence side effects:**

- `POST /presence` performs `INSERT ... ON CONFLICT ... DO UPDATE` plus prune/list reads.
- At 45 s intervals this is acceptable, but combined with autosave spam it amplifies DB pressure.

**No data migration needed.**

## 4. Environment / compose plane

**Stage stack:**

- Deployed via `.github/workflows/deploy-stage.yml`.
- Compose project `processmap_stage` using `docker-compose.yml` + `docker-compose.stage.yml`.
- Frontend nginx already emits correct `Cache-Control` for `index.html`.

**What must be true after fixes:**

- Frontend build must succeed with `npm run build`.
- Backend tests must pass (`pytest` targeted + full suite).
- No new env vars required for the autosave/polling changes.

## 5. Serving plane

**Stage runtime at audit time:**

- `/version` returned commit `75b6d6a6...`, build time `2026-06-28T16:32:19Z`, env `stage`.
- `/api/health` reported `ready` with Redis healthy.
- `GET /bpmn` response headers include `Cache-Control: no-store, no-cache, must-revalidate`.

**What to verify after deploy:**

- `/version` shows the new fix commit.
- `PUT /bpmn` frequency drops (no more than one per 10 s during normal editing).
- `409` rate on `PUT /bpmn` drops to near zero.
- Browser console no longer shows `MaxListenersExceededWarning`.
- Idle network traffic ≤ 5 req/min excluding heartbeat.

## Risk matrix

| Change | Risk | Mitigation |
|--------|------|------------|
| Autosave debounce 600 ms → 10 000 ms | Low | Matches existing test fixtures; users still get auto-save after a short idle. |
| Listener cleanup in BPMN wiring | Medium | Must be done carefully to avoid removing listeners that other code expects to persist. Use try/catch in unbinders and only remove handlers this code added. |
| Remote sync 15 s → 30 s | Low | Hidden-tab skipping already in place; 30 s is still responsive enough for remote-save highlights. |
| Overlay memoization | Low | Pure rendering optimization; no API contract change. |

## Go/no-go

- **Code plane:** GO — GET /bpmn is already correct; fix the real sources (autosave, listeners, polling).
- **Workspace plane:** GO — isolated branch, clean tree.
- **Data plane:** GO — no migrations, only reduced write frequency.
- **Env/compose plane:** GO — no infra changes.
- **Serving plane:** GO — will verify after stage deploy.
