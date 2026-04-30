# Project performance audit — decomposition and slowdown map

## 1. Source truth

- repo: `/Users/mac/PycharmProjects/processmap_audit_project_performance_decomposition_and_slowdown_map_v1`
- branch: `audit/project-performance-decomposition-and-slowdown-map-v1`
- HEAD: `21a2836540bebdfd83c016fade91594d9a16bb7a`
- origin/main: `21a2836540bebdfd83c016fade91594d9a16bb7a`
- merge-base: `21a2836540bebdfd83c016fade91594d9a16bb7a`
- git status before audit file: `## audit/project-performance-decomposition-and-slowdown-map-v1...origin/main`
- app version: `v1.0.93` from `frontend/src/config/appVersion.js`
- audit date: `2026-04-30`
- runtime access: authenticated stage access succeeded for read-only baseline on project `e41791f9f7`, session `1a5bd431d8`, org `Роботизация производств`.
- served stage bundle during audit: `index-DY2lsbX4.js`, app footer `v1.0.93`.
- mutation runtime: not repeated in this contour to avoid creating extra stage data; save/template mutation timings use prior measured stage evidence from the template/property audit.
- product code changed: no
- backend changed: no

Fresh read-only runtime baseline:

| Request | Duration | Encoded body |
| ------- | -------- | ------------ |
| `GET /assets/index-DY2lsbX4.js` | browser cache timing `0ms`; resource body `3,118,520 bytes` | `3,118,520` |
| `GET /assets/index-NtFDW9BI.css` | browser cache timing `0ms`; resource body `511,999 bytes` | `511,999` |
| `GET /api/auth/me` | `53ms` | `1,103 bytes` |
| `GET /api/workspaces` | `143ms` | `213 bytes` |
| `GET /api/note-notifications?limit=20&include_read=1` | `183ms` | `14,183 bytes` |
| `GET /api/explorer?workspace_id=ws_8b89c83ea810_main` | `188ms` | `40,601 bytes` |
| `GET /api/projects` | `128ms` | `22,877 bytes` |
| `GET /api/projects/e41791f9f7/sessions` | `4448ms` | `4,803,702 bytes` |
| `GET /api/projects/e41791f9f7/explorer?workspace_id=ws_8b89c83ea810_main` | `1175ms` | `1,241 bytes` |
| `GET /api/sessions/note-aggregates` | `361ms` | `1,437 bytes` |
| `GET /api/sessions/1a5bd431d8` | `3414ms` | `4,350,159 bytes` |
| `GET /api/sessions/1a5bd431d8/bpmn?raw=1&include_overlay=0` | `996ms` | `147,418 bytes` |
| `GET /api/sessions/1a5bd431d8/bpmn/versions?limit=1` | `338-988ms` observed | `1,229 bytes` |
| `GET /api/sessions/1a5bd431d8/bpmn/versions?limit=50` | `1084-1469ms`; three calls on initial session load | `36,684 bytes` each |
| `GET /api/sessions/1a5bd431d8/presence` | `991ms` on load; later `146ms` | `290 bytes` |
| `GET /api/sessions/1a5bd431d8/note-threads?status=open` | `420ms` | `4,562 bytes` |
| `GET /api/sessions/1a5bd431d8/mentionable-users` | `304ms` | `1,219 bytes` |

## 2. Executive summary

Главные причины торможения сейчас выглядят не как одна большая ошибка, а как несколько пересекающихся горячих контуров:

- полный `GET /api/sessions/{id}` остается центральным тяжелым payload. В свежем read-only baseline он был `4,350,159 bytes / 3414ms`; в предыдущем save runtime-аудите он занимал до `6474ms` после уже успешного durable `PUT /bpmn`;
- `GET /api/projects/{id}/sessions` оказался еще тяжелее на initial load: `4,803,702 bytes / 4448ms`;
- крупные frontend surfaces держат много derived state, effects, timers and save/poll lifecycle в одном слое: `ProcessStage.jsx` 6737 строк, `BpmnStage.jsx` 5806 строк, `App.jsx` 3673 строки;
- BPMN/modeler слой дорогой по природе: `saveXML`, import/export, overlay/decor rebuild, template apply, Camunda extension finalization;
- sync/CAS слой имеет много writers в один `PATCH /api/sessions/{id}` contract: notes, interview, title/status, bpmn_meta, hydration/autosave. Это создает race/self-conflict риск;
- build отдает большой initial chunk: `index-DY2lsbX4.js` 3028 kB raw / 841 kB gzip, Vite warning `Some chunks are larger than 500 kB`.

Сильнее всего на пользователя влияет не сам durable save, а операции вокруг него: full refetch, polling-triggered full reload, history/version loads and ambiguous sync UI. Быстрые P0 исправления должны отделить durable ack от background sync, убрать лишние full refetches из hot path, ограничить version/history payloads and stabilize same-client session writes. Архитектурного разделения требуют `ProcessStage`, session summary API, overlay read-model invalidation and code splitting.

## 3. Performance map by layer

### 3.1 Frontend runtime

- Heavy React surfaces:
  - `frontend/src/components/ProcessStage.jsx` has 6737 lines and 177 static markers among effects, callbacks, timers and API calls.
  - `frontend/src/components/process/BpmnStage.jsx` has 5806 lines and owns modeler, template insert, overlays and extension-state bridges.
  - `frontend/src/App.jsx` has 3673 lines and mixes workspace navigation, discussion notifications, session PATCH flows and top-level state.
  - `frontend/src/components/NotesPanel.jsx` has 3234 lines; `NotesMvpPanel.jsx` has 2232 lines.
  - `frontend/src/features/explorer/WorkspaceExplorer.jsx` has 2802 lines.
- Frequent rerender paths:
  - `ProcessStage.jsx` contains remote sync polling, version modal state, save upload status, toast timers, remote highlight state and session sync.
  - `NotesMvpPanel.jsx` renders discussions and notifications in one large panel mode.
  - `ElementSettingsControls.jsx` renders sidebar controls and BPMN extension-state status; it is hot when selection and overlays change.
- Derived state / preview maps:
  - BPMN overlays read from React preview/session maps, especially `bpmn_meta.camunda_extensions_by_element_id`.
  - Drift is possible when BO/XML is updated before local extension-state map is refreshed.
- Overlay/decor managers:
  - `frontend/src/features/process/bpmn/stage/decor/decorManager.js` has 1785 lines and is a hot bridge between BPMN canvas, preview maps and visual overlays.
- Expensive effects and timers:
  - `ProcessStage.jsx:254` has `REMOTE_SESSION_SYNC_POLL_MS = 9000`.
  - `useSessionPresence.js` heartbeats every `45000ms`.
  - `useAutosaveQueue.js` defaults to `380ms` debounce.
  - `createBpmnCoordinator.js` uses replay/save timers and defaults around `600ms`.
- Memory leak risks:
  - Most observed timers have cleanup, but risk remains because large components own many independent lifecycle timers. The risk is stale closure/base-version capture, not only unremoved intervals.

### 3.2 BPMN / modeler layer

- `saveXML` frequency is a major cost risk. `createBpmnPersistence.js`, template apply, Camunda extension save and manual save paths all serialize XML.
- Template apply creates BPMN shapes, rehydrates semantic payload, updates XML and may trigger meta/session writes.
- Copy/paste/template operations can duplicate work: BO mutation, XML save, overlay map update and session patch.
- Property overlays depend on extension-state maps. Runtime evidence from previous contours showed BO/XML had inserted properties while live overlays could lag until reload.
- Camunda extension finalization is durable through `PUT /api/sessions/{id}/bpmn`, but perceived save can be extended by full session refresh.
- Sequence path classification is a large related surface, but this audit did not touch it per non-goals. It remains a likely modeler/runtime cost area because it is tied to diagram traversal and decor.
- Large diagram behavior: prior source session XML was about `142 KB`; full session payload around it was `4.35 MB`, so XML is not the only growth source.
- Import/export cost should be measured separately with large diagrams because modeler import/export can block the main thread.

### 3.3 Save / sync / CAS layer

- `PUT /api/sessions/{id}/bpmn` is the correct durable BPMN XML save path. Prior runtime: about `160 KB` payload and `1145ms` on the large source session.
- `PATCH /api/sessions/{id}` is used by many secondary writers: notes, interview, status/title, bpmn_meta and sync hydration.
- `camundaExtensionsSaveBoundary.js` still contains multiple full session refresh paths:
  - conflict rebase fetch: `apiGetSession(sid)`;
  - background session refresh after durable ack;
  - non-background fallback full sync.
- `ProcessStage.jsx` remote poll fetches version head with `apiGetBpmnVersions(limit: 1)`, then calls full `apiGetSession(sid)` if the head is newer.
- CAS/self-conflict pattern:
  - prior runtime evidence: same client advanced server with bpmn_meta PATCH, then delayed interview/hydration PATCH sent stale base and got `409`.
  - source now has targeted mitigation in v1.0.93, but architectural risk remains because many writers share one session endpoint.
- Save queue/concurrency risk:
  - writers are distributed across `App.jsx`, `ProcessStage.jsx`, `useDiagramMutationLifecycle.js`, `useInterviewSyncLifecycle.js`, `camundaExtensionsSaveBoundary.js` and template apply.
  - no single user-visible write timeline exists yet.

### 3.4 Backend/API

- Heavy endpoints:
  - `GET /api/sessions/{id}` returns full session and was freshly measured at `4,350,159 bytes / 3414ms`.
  - `GET /api/projects/{project_id}/sessions` was freshly measured at `4,803,702 bytes / 4448ms`.
  - admin/workspace endpoints can load broad workspace payloads.
- Full session payloads:
  - full session is used after save, after remote poll detects newer head, in Explorer row operations and activation flows.
- Repeated polling:
  - frontend polls `GET /api/sessions/{id}/bpmn/versions?limit=1` every `9000ms` while visible.
  - presence heartbeat calls session presence every `45000ms`.
- Expensive serializers:
  - BPMN version endpoint computes user-facing revision numbers and session payload hashes.
  - `_latest_user_facing_bpmn_version(... include_xml=True)` can list up to `1000` versions and include XML for publish snapshot checks.
- Endpoints returning too much data:
  - `GET /api/sessions/{id}` has no lightweight summary variant for the hot cases observed.
  - version history can include XML for many versions if `include_xml=1`.
- N+1/query risks:
  - admin dashboard loads workspace, session meta map, templates, audit log and runtime status in one request.
  - admin projects calls `_workspace_payload(... limit=5000 ...)` before local counting/paging.
- Auth/presence polling:
  - fresh unauthenticated stage capture showed `POST /api/auth/refresh -> 401`.
  - presence code has guards for missing user and hidden tab, but auth-ready/backoff should be audited separately.

### 3.5 Database/storage

- Large session payloads:
  - `bpmn_xml`, `bpmn_meta`, `interview`, `notes_by_element`, discussion data and reports can grow together under session shape.
- `bpmn_versions` growth:
  - `session_bpmn_versions_list` exposes `limit`, default `100`, max not enforced server-side in handler.
  - include XML mode adds `bpmn_xml` per item.
  - `_latest_user_facing_bpmn_version` scans up to `1000` rows.
- `report_versions` growth:
  - report APIs and admin/session detail compute report counts and version data; separate payload growth audit needed.
- `bpmn_meta` size:
  - overlays, diagnostics, drawio, quality, template diagnostics and auto pass data can share one JSON field.
- JSON fields that grow without bounds:
  - `interview`, `bpmn_meta`, `notes_by_element`, version snapshots and audit/report histories need retention and size limits.
- Index/query risk:
  - source shows presence cleanup/index code exists, but a DB-focused audit should confirm indexes for session/org/version/history filters in live DB.

### 3.6 Bundle/build/runtime delivery

- Fresh `npm run build` succeeded with Vite warning. Stage served the same major artifact shape: `index-DY2lsbX4.js` and `index-NtFDW9BI.css`.
- Largest output:
  - `index-DY2lsbX4.js`: `3028.28 kB` raw, `841.14 kB` gzip.
  - `index-NtFDW9BI.css`: `511.79 kB` raw, `104.10 kB` gzip.
  - `Modeler-k_Lbni0b.js`: `350.81 kB` raw, `101.11 kB` gzip.
  - `NavigatedViewer-CV1Ysdtm.js`: `203.94 kB` raw, `60.88 kB` gzip.
  - `InterviewPathsView-B3JtgtFO.js`: `103.67 kB` raw, `28.87 kB` gzip.
- Lazy loading opportunities:
  - version/history modal, discussions/notification center, admin, Explorer and heavy interview paths can be split further.
- Heavy libraries:
  - BPMN modeler/viewer chunks are already separate, but initial app chunk remains too large.
- Cache/runtime traceability gaps:
  - prior audit saw `/api/meta.runtime` returning unknown build fields. Runtime identity should include commit/version/build time.

### 3.7 UX-perceived performance

- UI says or implies `Синхронизация...` too long when durable `PUT /bpmn` already succeeded but full session refetch is still running.
- User cannot distinguish:
  - "saved to server";
  - "local UI state refreshed";
  - "remote/session full sync completed".
- Version/history and remote-save polling can make the app look blocked by background truth reconciliation.
- Insert-template flows can complete XML durability while overlays or session meta read-model catches up later.
- P0 UX work should separate durable ack from background refresh and show conflict only when conflict is real.

## 4. Evidence table

| Area | Symptom | Evidence | File / Endpoint | Severity | User impact | Suggested contour |
| ---- | ------- | -------- | --------------- | -------- | ----------- | ----------------- |
| Full session refetch | Durable save done, UI still waits | Fresh read-only: `GET /api/sessions/1a5bd431d8` `4,350,159 bytes / 3414ms`; prior post-save: `6474ms`; `PUT /bpmn` completed earlier | `camundaExtensionsSaveBoundary.js`; `GET /api/sessions/{id}` | P0 | Save feels slow after success | `fix/session-refetch-after-bpmn-save-nonblocking-v1` |
| Project sessions load | Initial project open pulls very large sessions list | Fresh read-only: `GET /api/projects/e41791f9f7/sessions` `4,803,702 bytes / 4448ms` | `GET /api/projects/{id}/sessions` | P0 | First useful paint/session switch delayed | `fix/project-sessions-list-summary-payload-v1` |
| Remote poll escalation | Lightweight head poll can trigger full payload | `ProcessStage.jsx:1429` calls versions head; `ProcessStage.jsx:1458` calls `apiGetSession` when newer | `GET /bpmn/versions?limit=1`; `GET /sessions/{id}` | P0 | Background poll can cause heavy UI/network work | `fix/session-remote-poll-head-to-lightweight-summary-v1` |
| Version history payload | History can request XML for many versions | `ProcessStage.jsx:4230` fallback limit `200` when includeXml; backend includes `bpmn_xml` per item | `GET /bpmn/versions?include_xml=1` | P0/P1 | Modal can load too much XML | `fix/bpmn-history-headers-default-and-lazy-xml-v1` |
| Session PATCH writers | Same endpoint has many unrelated writers | `App.jsx` multiple `apiPatchSession`; hooks also patch interview/meta | `PATCH /api/sessions/{id}` | P0 | 409s and lost perceived progress | `fix/session-patch-cas-self-conflict-queue-v1` |
| Initial bundle | Main chunk too large | Build: `index-DY2lsbX4.js` `3028.28 kB` raw / `841.14 kB` gzip; Vite warning | Vite build output | P1 | Slow first load, parse/execute cost | `perf/frontend-route-and-panel-code-splitting-v1` |
| Monolithic process screen | Too much state in one component | `ProcessStage.jsx` 6737 lines, 177 effect/callback/timer/API markers | `ProcessStage.jsx` | P1 | Hard to isolate rerenders and write lifecycles | `perf/process-stage-decomposition-v1` |
| Overlay read-model drift | BO/XML can differ from overlay map until refresh | Prior runtime: inserted template properties in BO/XML, overlays lagged until reload | `BpmnStage.jsx`, `decorManager.js` | P0/P1 | Properties appear missing after insert | `perf/bpmn-overlay-read-model-invalidation-v1` |
| Presence/auth noise | Auth and presence produce background traffic | Fresh load: presence `991ms`, later `146ms`; heartbeat `45000ms`; unauth pre-login refresh returned `401` | `/api/auth/refresh`, presence endpoints | P1 | Console/network noise, wasted calls | `fix/presence-and-notification-polling-auth-backoff-v1` |
| Admin/workspace broad loads | Pagination after broad workspace payload in some handlers | `_workspace_payload(... limit=5000 ...)` in admin projects | `backend/app/routers/admin.py` | P2 | Admin gets slower with workspace growth | `audit/admin-workspace-payload-scaling-v1` |
| DB JSON growth | Session JSON fields can grow together | `bpmn_meta`, `interview`, `notes_by_element`, versions and reports are broad JSON stores | storage/backend source | P2 | Payload and serializer cost grows over time | `audit/db-json-payload-growth-and-indexes-v1` |

## 5. Endpoint payload and polling audit

| Endpoint | Caller | Trigger | Frequency | Payload size risk | Blocking? | Problem | Recommendation |
| -------- | ------ | ------- | --------- | ----------------- | --------- | ------- | -------------- |
| `GET /api/projects/{id}/sessions` | Project/session loader | Initial project open | On project open/session list refresh | Very high: fresh `4,803,702 bytes / 4448ms` | Yes on initial load | List endpoint appears to include too much per-session data | Return session summaries; lazy-load selected session detail |
| `GET /api/sessions/{id}` | `apiGetSession`; activation, save refresh, remote poll, Explorer | App load, save sync, newer remote head, row actions | Ad hoc; can follow every save/poll change | High: fresh `4,350,159 bytes / 3414ms` | Often yes | Used where only version/meta/summary is needed | Add lightweight summary; make post-save refresh background/nonblocking |
| `GET /api/sessions/{id}/bpmn` | `apiGetBpmnXml`, BPMN sync/persistence | Modeler load/raw XML sync | On load and explicit sync | Medium: fresh `147,418 bytes / 996ms` | Yes on load | Better than full session, but modeler import can block | Keep XML-specific; measure import/export time |
| `PUT /api/sessions/{id}/bpmn` | `apiPutBpmnXml`, BPMN persistence, Camunda save | Manual save, property save, template apply | User writes | Medium/high by XML size; prior `160 KB` and `1145ms` | Yes until durable ack | Correct durable path, but should not be followed by blocking full refetch | Use durable ack immediately; background sync separately |
| `PATCH /api/sessions/{id}` | `apiPatchSession` in App/hooks/stage | Notes, interview, status/title, bpmn_meta, sync | Many small writers | Low payload, high conflict risk | Sometimes | Same-client stale base can self-conflict | Central writer queue/base resolver; conflict visibility |
| `GET /api/sessions/{id}/bpmn/versions?limit=1` | `ProcessStage.jsx` remote poll | Mount, foreground, interval | Every `9000ms` while visible | Low/medium: fresh `1,229 bytes`, `338-988ms`, but handler computes hashes/list info | No unless newer head triggers full session | Poll result can escalate to `GET /session` | Lightweight head endpoint with ETag/backoff/hidden-tab guard |
| `GET /api/sessions/{id}/bpmn/versions?limit=50` | Version history state/modal | Initial session load and history | Fresh initial load made three calls | Medium: fresh `36,684 bytes`, `1084-1469ms` each | Modal/load state | Duplicate calls on initial load are visible waste | Coalesce callers; keep default XML-excluded and paginate |
| `GET /api/sessions/{id}/bpmn/versions?include_xml=1` | History/detail paths | Preview/restore/history details | User action | High: XML per version; frontend fallback can request 200 | Yes in modal | Bulk XML history is too expensive | Lazy load one XML version by id; cap server limit |
| `POST /api/sessions/{id}/presence` | `useSessionPresence` | Mount, focus, interval | Every `45000ms`; hidden interval skipped | Low | No | Auth-ready/backoff behavior needs proof | Guard until auth ready; backoff on 401/offline |
| `DELETE /api/sessions/{id}/presence` | `useSessionPresence` | unmount/page exit | On exit/unmount | Low | No | keepalive/telemetry can add exit noise | Keep but suppress repeated failures |
| notification/discussion endpoints | `App.jsx`, `NotesMvpPanel.jsx` | Open discussions/notifications | User action | Medium; fresh notification list `14,183 bytes / 183ms`; threads `4,562 bytes / 420ms` | Panel loading | Two result sets can render in large panel | Paginate and lazy-load thread bodies |
| Explorer workspace endpoints | `WorkspaceExplorer.jsx` | Explorer navigation/search | User action and search debounce | Medium/high with workspace size | Explorer loading | Search/page/render scaling with workspace size | Server-side pagination/search and cached page slices |
| Admin users/org endpoints | `admin.py` routers | Admin pages | Admin action | High with org size | Admin loading | Some handlers pre-load large workspace data | Separate admin scaling audit |

## 6. Frontend hot surfaces

| Surface | File(s) | Why hot | Risk | Proposed decomposition |
| ------- | ------- | ------- | ---- | ---------------------- |
| App shell/session routing | `frontend/src/App.jsx` | 3673 lines; multiple `apiPatchSession`, discussion notifications, workspace/session actions | Top-level rerender and cross-feature coupling | Split workspace shell, session mutations, discussion launcher |
| Process stage | `frontend/src/components/ProcessStage.jsx` | 6737 lines; 177 static hot markers; polling, history, save UI, remote highlights | Any change can rerender or rewire too much | Extract remote sync, version history, save status, session writer modules |
| BPMN stage | `frontend/src/components/process/BpmnStage.jsx` | 5806 lines; modeler, overlays, template insert, extension-state | Canvas lifecycle and React state can drift | Isolate modeler adapter, overlay invalidation and template side effects |
| Notes legacy panel | `frontend/src/components/NotesPanel.jsx` | 3234 lines; notes and property controls bridge | Large UI surface near save/status | Separate property editor/save bridge from notes |
| Notes MVP panel | `frontend/src/components/NotesMvpPanel.jsx` | Discussion and notification modes in one 2232-line component | Heavy render on panel open | Virtualize/paginate discussions; lazy notification mode |
| Workspace Explorer | `frontend/src/features/explorer/WorkspaceExplorer.jsx` | 2802 lines; search debounce, tree, row actions, session fetch before patch | Scaling and row-action full fetch risk | Split tree/search/actions; prefer summary row updates |
| Sidebar controls | `frontend/src/components/sidebar/ElementSettingsControls.jsx` | 2436 lines; selected element, extension rows, trust/status copy | Rerenders on selection/overlay changes | Extract Camunda properties editor and status badge |
| Camunda save boundary | `frontend/src/features/process/camunda/camundaExtensionsSaveBoundary.js` | Builds canonical XML, PUTs XML, can full refetch | Perceived save delay | Make durable ack first-class and refetch optional/background |
| BPMN persistence lifecycle | `createBpmnPersistence.js`, `createBpmnCoordinator.js` | XML save/load, debounce/replay timers | Main-thread serialization and stale closures | Instrument saveXML/import cost and queue state |
| Interview sync lifecycle | `useInterviewSyncLifecycle.js` | Debounced PATCH writer, CAS base handling | Self-conflict with other session writers | Resolve base at send time and route through writer coordinator |
| Diagram mutation lifecycle | `useDiagramMutationLifecycle.js` | Secondary session patch after diagram mutation | Stale base and duplicate writes | Same session writer coordinator |
| Discussion notification center | `App.jsx`, `NotesMvpPanel.jsx`, `discussionNotificationCenterModel.js` | Mentions and notifications fetched/rendered on open | Panel load spike | Paginate and lazy-render |
| Overlay/decor manager | `decorManager.js` | 1785-line canvas decor engine | Expensive rebuilds and drift | Single invalidation model and targeted overlay updates |
| Template apply | `templatePackAdapter.js`, `useTemplatesStore.js`, `BpmnStage.jsx` | BO mutation, XML save, meta seed, overlays | Duplicate insert and overlay drift | Generated-id meta seeding and targeted refresh tests |
| Version/history modal | `ProcessStage.jsx` | Can load headers or XML versions | Large history payload | Header-only list, lazy XML by version id |

## 7. Known current project-specific slowdown candidates

1. Full session refetch после durable `PUT /bpmn`: подтверждено. Source path exists; fresh read-only session fetch was `4,350,159 bytes / 3414ms`; prior post-save runtime was `6474ms`.
2. Heavy `GET /api/sessions/{id}` payload around `4MB+`: подтверждено fresh runtime.
3. `bpmn_versions` history fetch with `include_xml` / large limit: подтверждено as source risk. Frontend can request `includeXml` with fallback limit `200`; backend includes XML per row. Fresh initial load also made three `limit=50` calls at `1084-1469ms` each.
4. Frequent `bpmn/versions?limit=1` polling: подтверждено. `REMOTE_SESSION_SYNC_POLL_MS = 9000`; fresh poll samples were `338-988ms`.
5. Presence polling 401/noise: подтверждено как background risk. Fresh authenticated presence load was `991ms`, later `146ms`; pre-auth refresh returned `401`; presence heartbeat is `45000ms` and skips hidden interval.
6. `PATCH /sessions` self-conflicts after same-client bpmn_meta writes: подтверждено by prior runtime. v1.0.93 appears to mitigate part of this, but many-writer architecture remains risky.
7. Template insert overlay state not refreshed until reload: подтверждено by prior runtime; later fixes should be regression-tested, not mixed into this audit.
8. Overlay/decor preview map requiring full hydration: подтверждено as architectural pattern. The overlay read-model depends on local/session maps, not only BO scan.
9. Large BPMN XML `saveXML` cost: подтверждено as source risk; needs runtime main-thread measurement.
10. Notes/Discussions surfaces loading too much context: подтверждено as source risk from large panels and notification/thread fetch/render paths.
11. Account dropdown / notification hub fetch/render cost: подтверждено as source risk in `App.jsx` and `NotesMvpPanel.jsx`; runtime measurement blocked by auth.
12. Explorer workspace-wide search client-side scaling: подтверждено as source risk; search debounce and Explorer render surface are large.
13. Bundle large chunk warning from Vite: подтверждено by fresh build.
14. App runtime stale asset/update risks: подтверждено as observability gap. Prior audit saw runtime meta build fields unknown; source/build identity should be first-class.

## 8. Decomposition plan

### P0 — immediate user-visible slowdown

1. `audit/performance-runtime-metrics-baseline-v1`
   - problem: fresh read-only runtime baseline exists, but mutation scenarios were not repeated in this audit to avoid extra stage data.
   - proposed fix: add no product code; capture Playwright network/performance baselines with authenticated session and fixed scripts.
   - validation: HAR-like endpoint table for initial load, save, template insert, history, discussions, Explorer.
   - why first: gives reliable before/after deltas for all following contours.

2. `fix/project-sessions-list-summary-payload-v1`
   - problem: `GET /api/projects/{id}/sessions` is the largest fresh initial-load payload.
   - proposed fix: return bounded session summary rows for list view; lazy-load selected session detail.
   - validation: project open no longer downloads multi-MB session list.
   - why first: this blocks initial project/session startup before the user can work.

3. `fix/session-refetch-after-bpmn-save-nonblocking-v1`
   - problem: full `GET /session` blocks perceived save after durable `PUT /bpmn`.
   - proposed fix: treat `PUT /bpmn 200` as durable ack; run full refetch in background or replace with lightweight patch/session summary.
   - validation: property save shows server-saved status immediately after PUT; background refresh cannot hold save UI.
   - why first: prior runtime shows this is the biggest measured slowdown.

4. `fix/session-remote-poll-head-to-lightweight-summary-v1`
   - problem: 9-second head poll can escalate to full `GET /session`.
   - proposed fix: use head payload/version summary for remote highlight or a dedicated lightweight endpoint.
   - validation: remote version change does not fetch 4MB session unless user accepts refresh.
   - why first: recurring background cost.

5. `fix/bpmn-history-headers-default-and-lazy-xml-v1`
   - problem: history list can include XML for many versions.
   - proposed fix: list headers only; fetch XML only for selected preview/restore version; cap server limit.
   - validation: opening history never includes `bpmn_xml` for all rows.
   - why first: low-risk payload reduction.

6. `fix/session-patch-cas-self-conflict-queue-v1`
   - problem: many session writers can race and self-conflict.
   - proposed fix: centralize same-client base version resolution and writer sequencing for secondary PATCHes without hiding real 409s.
   - validation: delayed interview/meta/title writes use latest same-client accepted base; external conflict still surfaces.
   - why first: reduces visible 409s and lost trust.

7. `uiux/save-status-durable-vs-sync-state-v1`
   - problem: UI copy conflates durable save and state refresh.
   - proposed fix: statuses: local changes, saving, saved on server, refreshing state, conflict/error.
   - validation: durable operation completion is visible separately from background sync.
   - why first: immediate user trust improvement.

8. `fix/presence-and-notification-polling-auth-backoff-v1`
   - problem: auth/presence/notification calls can create 401/noise or background traffic.
   - proposed fix: start only after auth ready; backoff on 401/offline; pause hidden tab where safe.
   - validation: unauth/expired auth does not spam network.
   - why first: small scoped cleanup with clear network benefit.

### P1 — structural performance improvements

1. `feature/session-summary-lightweight-endpoint-v1`
   - goal: provide lightweight session truth for version, title, status, bpmn_meta head and hashes without full payload.
   - expected files: API route, storage serializer, frontend api wrapper, ProcessStage refresh callers.
   - validation: hot paths no longer call full `GET /session` for summary data.
   - risk: backend contract addition; should be additive only.

2. `feature/bpmn-history-pagination-and-lazy-xml-v1`
   - goal: server-enforced pagination, header-only list, XML by version id.
   - expected files: backend versions endpoint, frontend history modal.
   - validation: large history list stays bounded.
   - risk: restore/preview behavior must remain exact.

3. `perf/bpmn-overlay-read-model-invalidation-v1`
   - goal: one invalidation path for overlays from `bpmn_meta.camunda_extensions_by_element_id`.
   - expected files: `BpmnStage.jsx`, `decorManager.js`, Camunda extensions parser/tests.
   - validation: insert duplicate templates, edit properties, reload and overlay toggle all agree.
   - risk: visual regression on canvas overlays.

4. `perf/frontend-route-and-panel-code-splitting-v1`
   - goal: reduce initial `index` chunk by lazy-loading panels/routes.
   - expected files: `App.jsx`, Explorer/Admin/Discussion imports, Vite build config if needed.
   - validation: initial chunk below agreed budget; no route loading regression.
   - risk: loading states and auth gating.

5. `perf/process-stage-decomposition-v1`
   - goal: split `ProcessStage` hot state into remote sync, save status, version history and canvas shell modules.
   - expected files: new hooks/controllers under `features/process`.
   - validation: behavior unchanged; rerender profiling improved.
   - risk: broad frontend refactor; do after metrics.

6. `perf/explorer-server-side-search-and-pagination-v1`
   - goal: keep Explorer responsive on large workspaces.
   - expected files: Explorer API/search hooks/backend workspace endpoints.
   - validation: large workspace search returns bounded results and stable render time.
   - risk: server query/index needs proof.

### P2 — cleanup / instrumentation / observability

1. `ops/runtime-build-identity-and-cache-proof-v1`
   - goal: expose version, commit, build time and asset identity in runtime API/UI diagnostics.
   - validation: stage bundle/source mismatch can be proven quickly.

2. `ops/performance-telemetry-baseline-v1`
   - goal: non-invasive metrics for save duration, full refetch duration, modeler import/export and bundle load.
   - validation: telemetry visible in dev/stage diagnostics without user noise.

3. `audit/db-json-payload-growth-and-indexes-v1`
   - goal: quantify growth of `bpmn_meta`, `interview`, `notes_by_element`, `bpmn_versions`, `report_versions`.
   - validation: DB query plans, payload histograms and retention recommendations.

4. `audit/admin-workspace-payload-scaling-v1`
   - goal: inspect admin/workspace endpoints that load broad workspace data.
   - validation: endpoint timing and payload by org size.

5. `audit/npm-dependency-vulnerability-and-bundle-cost-v1`
   - goal: resolve `npm ci` audit warnings and identify costly dependencies.
   - validation: dependency report and bundle analyzer output.

## 9. Recommended implementation order

1. `audit/performance-runtime-metrics-baseline-v1`
2. `fix/project-sessions-list-summary-payload-v1`
3. `fix/session-refetch-after-bpmn-save-nonblocking-v1`
4. `fix/session-remote-poll-head-to-lightweight-summary-v1`
5. `fix/bpmn-history-headers-default-and-lazy-xml-v1`
6. `fix/session-patch-cas-self-conflict-queue-v1`
7. `uiux/save-status-durable-vs-sync-state-v1`
8. `fix/presence-and-notification-polling-auth-backoff-v1`
9. `feature/session-summary-lightweight-endpoint-v1`
10. `perf/bpmn-overlay-read-model-invalidation-v1`
11. `perf/frontend-route-and-panel-code-splitting-v1`
12. `feature/bpmn-history-pagination-and-lazy-xml-v1`
13. `perf/process-stage-decomposition-v1`
14. `perf/explorer-server-side-search-and-pagination-v1`
15. `ops/runtime-build-identity-and-cache-proof-v1`
16. `ops/performance-telemetry-baseline-v1`
17. `audit/db-json-payload-growth-and-indexes-v1`

## 10. Non-goals

- Не переписываем архитектуру в этом audit contour.
- Не оптимизируем вслепую.
- Не меняем backend contract без отдельного source/runtime proof.
- Не ломаем CAS и не скрываем реальные `409`.
- Не убираем reload/hydration без замены на доказанный lightweight truth path.
- Не скрываем ошибки и не делаем blind retry.
- Не смешиваем этот audit с template apply / overlay / secondary PATCH fix contours.
- Не делаем deploy, merge или PR.

## 11. Final verdict

`PERFORMANCE_BASELINE_READY`

Свежий authenticated read-only baseline на stage снят и подтверждает главные slowdown candidates: project sessions list `4.80 MB / 4.45s`, full session detail `4.35 MB / 3.41s`, BPMN XML `147 KB / 996ms`, repeated version list calls `36.7 KB / 1.08-1.47s` and 9-second version-head polling. Mutation scenarios не повторялись в этом audit contour, чтобы не создавать лишние stage data; для save/template используются prior runtime measurements. Следующий шаг перед P0 fixes: dedicated runtime metrics contour with scripted before/after scenarios.
