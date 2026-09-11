# PLAN — feature/save-decomposition-v1

**Contour:** `feature/save-decomposition-v1`  
**Base:** `new-origin/main` (`35cbc78e`)  
**Goal:** Fix the immediate 409 Conflict on property save and decompose save operations into bounded backend modules.

---

## 1. Source/runtime truth

- **Canonical repo:** `/opt/processmap-test`
- **Worktree:** `/opt/processmap-test/.worktrees/feature-save-decomposition-v1`
- **Branch:** `feature/save-decomposition-v1` tracking `new-origin/main`
- **Runtime stage:** `http://stage.processmap.ru` / `http://clearvestnic.ru:5177`
- **Prior audit:** `.planning/contours/audit/save-decomposition/`

---

## 2. Problem statement

When a user opens a session and immediately saves Camunda properties, the frontend sends a stale `base_diagram_state_version`, causing `409 DIAGRAM_STATE_CONFLICT`. After clicking the canvas and refocusing, the version refreshes and save succeeds. Root cause: the frontend's cached `diagram_state_version` is not refreshed before property-only saves, and the backend strictly enforces CAS on `PUT /bpmn` for these saves.

---

## 3. Bounded scope

### In scope
1. **Immediate 409 fix:**
   - Frontend: re-fetch fresh session meta before property save, or use a property-only save path that does not require exact CAS.
   - Backend: add a `properties_only` grace mode for property saves that only touch `bpmn_meta` / extension-state (no BPMN XML mutation).
2. **Backend module decomposition (`backend/app/save_services/`):**
   - `session_save/` — `PUT /bpmn`, versioning, conflict resolution.
   - `property_save/` — `PATCH /meta`, extension-state, Camunda properties dedup.
   - `status_service/` — status transitions, optimistic update + rollback.
   - `analytics_aggregator/` — async analytics refresh after save events.
   - `org_dictionary/` — CRUD org property definitions.
3. **Tests:** unit, integration, and an E2E check that property save after session open does not 409.
4. **Build + stage smoke** (`npm run build`, deploy to test, smoke).

### Out of scope
- Extracting services to separate deployables or external microservices.
- Full retirement of `_legacy_main.py`.
- DB schema migrations (e.g., `session_status` column) — deferred to migration roadmap Phase 0.
- WebSocket/SSE real-time sync.

---

## 4. Architecture decisions

| Decision | Rationale |
|----------|-----------|
| Keep modules inside `backend/app/save_services/` | Delivers decomposition value without the infra cost of separate services. Matches audit’s “Phase 1 facade” approach. |
| `property_save` owns `PATCH /meta` and a new `PUT /extension-state` | Property-only saves should not go through full BPMN XML serialization; this removes the 409 surface. |
| `session_save` owns `PUT /bpmn` and version restore | Centralizes CAS/locking/versioning for actual diagram XML mutations. |
| `status_service` owns `changeCurrentSessionStatus` | Removes optimistic-update/rollback logic from `App.jsx`. |
| `analytics_aggregator` consumes Redis pub-sub events | Keeps save latency low; analytics becomes eventually consistent. |
| `org_dictionary` remains separate from `property_save` | Dictionary is reference data; property save is transactional session data. |

---

## 5. Implementation phases

### Phase 1 — Immediate 409 fix
- Add backend `PATCH /api/sessions/{sid}/meta/properties` (or `properties_only` flag) with relaxed CAS.
- Frontend: before property save, call `apiGetSessionMeta(sid)` and update `draft.base_diagram_state_version`.
- Add `PUT /api/sessions/{sid}/extension-state` as a dedicated property-save boundary.

### Phase 2 — `property_save` module
- Move `PATCH /meta` and new `PUT /extension-state` handlers into `backend/app/save_services/property_save/`.
- Reuse keep-last dedup logic from `camunda_meta_utils.py`.

### Phase 3 — `session_save` module
- Move `PUT /bpmn` and version restore into `backend/app/save_services/session_save/`.
- Keep CAS/Redis lock logic in module.

### Phase 4 — `status_service` module
- Move status transition endpoint/handler out of `App.jsx` / `_legacy_main`.
- Implement optimistic update + rollback.

### Phase 5 — `analytics_aggregator` module
- Publish `SessionSaved` Redis event from `session_save` / `property_save`.
- Consume event and recompute analytics asynchronously.

### Phase 6 — `org_dictionary` module
- Move org property dictionary CRUD into `backend/app/save_services/org_dictionary/`.

### Phase 7 — Tests + build + deploy
- Unit tests for each service.
- Integration tests for 409 fix and version conflict handling.
- E2E smoke: open session → immediately save property → no 409.
- `npm run build`, deploy to test, smoke.

---

## 6. Acceptance criteria

- [ ] `INPUT_SUMMARY.md` filled from audit.
- [ ] Phase 1: property save after session open does not produce 409.
- [ ] Phase 2: `property_save` module created and `PATCH /meta` isolated.
- [ ] Phase 3: `session_save` module created and `PUT /bpmn` isolated.
- [ ] Phase 4: `status_service` module created and status optimistic update removed from `App.jsx`.
- [ ] Phase 5: analytics refresh is event-driven and non-blocking.
- [ ] Phase 6: `org_dictionary` module created.
- [ ] 20+ unit tests, 5+ integration tests, E2E 409 fix.
- [ ] `npm run build` passes.
- [ ] Deploy + smoke-test on test environment.
- [ ] PR opened with merge strategy = Create merge commit.
- [ ] No merge/deploy without explicit user approval.

---

## 7. Risks

- Moving logic out of `_legacy_main.py` may surface hidden import cycles.
- CAS relaxation for property-only saves must not allow BPMN XML corruption.
- Frontend state sync after meta-only save must keep `diagram_state_version` consistent.
