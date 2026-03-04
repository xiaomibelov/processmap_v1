# D1 Contracts (ProcessStage Shell Split)

Источник: `docs/audit/decompose_plan_pack_20260304_233406.md`  
Цель D1: снизить размер `ProcessStage` без изменения поведения и без нарушения системных контрактов.

## 1) Persist / merge `bpmn_meta` (frontend + backend)

- Frontend optimistic persist для stage-частей:
  - `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js:59` `persistHybridLayerMap(...)`
  - `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js:117` `persistHybridV2Doc(...)`
  - `frontend/src/features/process/stage/controllers/useSessionMetaPersist.js:169` `persistDrawioMeta(...)`
  - Все три функции пишут через `apiPatchSession(..., { bpmn_meta: optimisticMeta })` и держат rollback (`:82`, `:136`, `:188`).
- Frontend merge/normalize в корневом orchestration:
  - `frontend/src/App.jsx:590` нормализация `sessionMeta` в `sessionToDraft(...)`
  - `frontend/src/App.jsx:2194`, `:2360`, `:2501`, `:2668` точки merge `normalizeBpmnMeta(draft?.bpmn_meta)`.
- Backend canonical merge/normalize:
  - `backend/app/main.py:1959` `_normalize_bpmn_meta(...)`
  - `backend/app/main.py:4751` `session_bpmn_meta_patch(...)`
  - `backend/app/main.py:5139` `session_bpmn_save(...)`

## 2) Session save lock (Redis)

- Lock helper:
  - `backend/app/redis_lock.py:48` `acquire_session_lock(session_id, ttl_ms=...)`
- Применение в критичном save:
  - `backend/app/main.py:5139` `session_bpmn_save(...)`
  - `backend/app/main.py:5140` `lock = acquire_session_lock(session_id, ttl_ms=15000)`
- Контракт D1: любые UI-рефакторы `ProcessStage` не меняют семантику backend save/lock и не обходят `PUT /api/sessions/{id}/bpmn`.

## 3) Canonical endpoints (workspace, TL;DR, без fanout)

- Workspace canonical endpoint:
  - Frontend caller: `frontend/src/lib/api.js:622` `apiGetEnterpriseWorkspace(...)`
  - Canonical URL: `frontend/src/lib/api.js:654` `/api/enterprise/workspace`
  - Backend handler: `backend/app/main.py:5845` `@app.get("/api/enterprise/workspace")`
- TL;DR canonical endpoint:
  - Backend handler: `backend/app/main.py:2984` `@app.get("/api/sessions/{session_id}/tldr")`
- Контракт D1: не добавлять новые fallback arrays/alias fanout в stage wiring; использовать только канонические пути.

## 4) E2E readiness anchors / testids

- Topbar/session anchors в e2e:
  - `frontend/e2e/hybrid-layer-layers.spec.mjs:29` `topbar-project-select`
  - `frontend/e2e/hybrid-layer-layers.spec.mjs:30` `topbar-session-select`
- Diagram toolbar anchors в stage:
  - `frontend/src/components/ProcessStage.jsx:5457` `diagram-toolbar-save`
  - `frontend/src/components/ProcessStage.jsx:5462` `diagram-toolbar-save-status`
  - `frontend/src/components/ProcessStage.jsx:5555` `diagram-toolbar-overflow-toggle`
- Runtime readiness hooks для modeler/e2e:
  - `frontend/src/components/process/BpmnStage.jsx:3169` `window.__FPC_E2E_MODELER__`
  - `frontend/src/components/process/BpmnStage.jsx:3027` `window.__FPC_E2E_RUNTIME__`
  - `frontend/src/components/ProcessStage.jsx:2347` `window.__FPC_E2E_HYBRID__`
  - `frontend/src/components/ProcessStage.jsx:4985` `window.__FPC_E2E_DRAWIO__`
- Контракт D1: не ломать существующие `data-testid` и e2e глобальные ready hooks.

## 5) Feature flags / env gates

- Redis optional mode:
  - `backend/app/redis_client.py:9` читает `REDIS_URL`
  - `backend/app/redis_client.py:30` warning + no-op если `REDIS_URL` пустой.
- E2E env gates:
  - `frontend/e2e/hybrid-layer-layers.spec.mjs:418` `E2E_HYBRID_LAYER`
  - `frontend/e2e/hybrid-layer-delete-reload.spec.mjs:263` `E2E_HYBRID_LAYER`
  - `frontend/e2e/drawio-embedded.spec.mjs:91` `E2E_DRAWIO`/`E2E_HYBRID_LAYER`
  - `frontend/e2e/accept-invite-enterprise.spec.mjs:12` `E2E_ENTERPRISE`
  - `scripts/ci_enterprise_e2e.sh:79` `E2E_DRAWIO_SMOKE`
- Vite/env gates в frontend:
  - `frontend/src/lib/api.js:4` `VITE_API_BASE`
  - `frontend/src/components/process/interview/featureFlags.js:31` `VITE_INTERVIEW_*`
- Контракт D1: shell split не должен менять значения/семантику env gates и не должен делать Redis обязательным.

## 6) D1.3 shell view-model and UI composition boundaries

- Новый controller для view-model shell/panels/dialogs:
  - `frontend/src/features/process/stage/controllers/useProcessStageShellController.js`
  - Роль: вычисляет shell-level derived flags (`canSaveNow`, `canCreateTemplateFromSelection`, `hasPathHighlightData`) и отдает структурированные `shellProps/panelsProps/dialogsProps`.
- Новый “layout-only” header wrapper для stage:
  - `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
  - Роль: рендер toolbar/header и прокидывание top panels без stage-бизнес-логики.
- Новый выделенный блок diagram action controls/popovers:
  - `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
  - Роль: рендер action-bar + popovers (paths/hybrid tools/playback/layers/quality/overflow) через props wiring.
- Контракт D1.3:
  - `frontend/src/components/ProcessStage.jsx` остается owner state и orchestration hooks, но большие JSX-секции и shell-level view wiring живут вне `ProcessStage`.
  - Никаких изменений payload/flow сохранения (`persistHybridV2Doc`, `persistDrawioMeta`, `apiPatchSession`) в рамках shell split.

## 7) Playback orchestration boundary (D1.6)

- Runtime playback state machine вынесен в:
  - `frontend/src/features/process/stage/controllers/usePlaybackController.js`
- Контракт публичного API playback controller:
  - `highlightTargets` (node/edge ids для подсветки шага)
  - `overlayInteractionGuard.markOverlayInteraction(...)`
  - `overlayInteractionGuard.shouldIgnorePlaybackReset()`
  - `controls.start()/stop()/next()/prev()/goTo(...)`
  - `setFollowMode(bool)` (через playback auto-camera/follow)
- Совместимость со старым импортом для поэтапного перехода:
  - `frontend/src/features/process/stage/hooks/usePlaybackController.js` ре-экспортирует controller.
