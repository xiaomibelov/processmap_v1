# SOURCE_INVENTORY — ProcessMap Agent RAG / Knowledge Layer

Generated: 2026-05-16T14:05:12+00:00
Contour: architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1

---

## A. Project Atlas / Obsidian

Root: `/srv/obsidian/project-atlas/ProcessMap`

**Summary:** 727 files, ~5.6 MB total.

### Curated Categories (high-priority for indexing)

| Category | Files | Truth Level | Priority | Notes |
|----------|-------|-------------|----------|-------|
| AgentReports | ~350 | evidence / canonical | critical | Mirrored contour reports; include REVIEW_PASS, CHANGES_REQUESTED, REWORK_REQUEST |
| Architecture | 2 | canonical | critical | ADR, system design notes |
| Audits | 2 | evidence | high | Performance baselines and profiles |
| Decisions | 1 | canonical | critical | ADR-AG-UI-for-Product-Actions-AI.md |
| Prompts | 2 | prompt_template | high | Agent prompt contracts and skill bindings |
| RAG | 1 | canonical | critical | Existing RAG fit analysis (AG-UI-RAG-Agent-Fit.md) |
| Runtime | ~8 | evidence | normal | Sync reports, runner bindings |
| Backlog | unknown | backlog | normal | Prioritized work items (verify existence) |
| Contours | unknown | canonical | high | Contour summary notes in Atlas |
| Evidence | unknown | evidence | normal | Screenshots, runtime proof |
| HANDOFF | 1 + many in _Imported | draft / evidence | normal | Handoff notes; curated only |
| _Imported/20260514 | ~300 | draft | low | Triage required before indexing as truth |

### Key Files (sample — high-priority)

| Path | Category | Truth Level | Priority |
|------|----------|-------------|----------|
| `./Architecture/AG-UI Protocol Fit for ProcessMap.md` | Architecture | canonical | critical |
| `./Architecture/Processmap flow.md` | Architecture | canonical | critical |
| `./Decisions/ADR-AG-UI-for-Product-Actions-AI.md` | Decisions | canonical | critical |
| `./Audits/Diagram Baseline No Overlays Canvas Profile.md` | Audits | evidence | high |
| `./Audits/Diagram Property Overlays Performance Audit.md` | Audits | evidence | high |
| `./Prompts/AG-UI-Future-Implementation-Contour-Prompt.md` | Prompts | prompt_template | high |
| `./Prompts/PROCESSMAP_AGENT3_PLAYWRIGHT_REVIEW_BINDING.md` | Prompts | prompt_template | high |
| `./RAG/AG-UI-RAG-Agent-Fit.md` | RAG | canonical | critical |
| `./Runtime/GSD Runner Binding on clearvestnic.md` | Runtime | evidence | normal |
| `./Runtime/project-atlas-sync-report-sync-e2e-20260514_171038.md` | Runtime | evidence | normal |

### Warnings

- `_Imported/20260514` contains ~300 raw imports from Obsidian Vault. **Do NOT index as canonical truth** until triage/curator review.
- `AgentReports` contains both `REVIEW_PASS` and `CHANGES_REQUESTED` contours. The latter must be indexed as high-priority warnings.

---

## B. Planning Contours

Root: `/opt/processmap-test/.planning/contours`

**Summary:** 40 contours across 8 categories.

### Contour List with Verdicts

| ID | Category | Verdict | Files Present | Warning |
|----|----------|---------|---------------|---------|
| `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` | architecture | pending | 11 | current contour |
| `audit/diagram-baseline-no-overlays-canvas-profile-v1` | audit | REVIEW_PASS | 20 | — |
| `audit/diagram-post-optimization-runtime-profile-v1` | audit | REVIEW_PASS | 19 | — |
| `audit/diagram-property-overlays-performance-gsd-v1` | audit | REVIEW_PASS | 18 | — |
| `feature/diagram-analytics-layer-selection-lite-decomposition-first-v1` | feature | REVIEW_PASS | 19 | — |
| `fix/bpmn-versions-head-check-dedupe-v1` | fix | REVIEW_PASS | 17 | — |
| `fix/diagram-5180-version-proof-and-canvas-lag-regression-v1` | fix | REVIEW_PASS | 20 | — |
| `fix/diagram-canvas-reload-loop-and-lag-regression-v1` | fix | REVIEW_PASS | 17 | — |
| `fix/diagram-decor-pipeline-disable-when-overlays-off-v1` | fix | REVIEW_PASS | 15 | — |
| `fix/diagram-drag-lag-gsd-review-version-ledger-rework-v1` | fix | REVIEW_PASS | 21 | CHANGES_REQUESTED present |
| `fix/diagram-loading-state-machine-and-canvas-controller-decomposition-v1` | fix | REVIEW_PASS | 21 | — |
| `fix/diagram-non-edit-put-bpmn-guard-v1` | fix | REVIEW_PASS | 16 | — |
| `fix/diagram-real-drag-performance-and-engine-decomposition-v1` | fix | REVIEW_PASS | 19 | — |
| `fix/diagram-visible-version-and-large-canvas-lag-v1` | fix | REVIEW_PASS | 21 | — |
| `perf/diagram-derived-maps-and-render-boundary-v1` | perf | REVIEW_PASS | 19 | **REWORK_REQUEST.md** |
| `perf/diagram-eventbus-listener-and-raf-coalescing-v1` | perf | REVIEW_PASS | 16 | — |
| `perf/diagram-initial-load-skeleton-and-lazy-hydration-v1` | perf | REVIEW_PASS | 19 | — |
| `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` | perf | REVIEW_PASS | 21 | **REWORK_REQUEST.md** |
| `perf/diagram-property-overlays-viewport-culling-v1` | perf | REVIEW_PASS | 15 | — |
| `perf/diagram-svg-css-repaint-reduction-v1` | perf | REVIEW_PASS | 17 | — |
| `perf/process-stage-baseline-jank-v1` | perf | REVIEW_PASS | 18 | **REWORK_REQUEST.md** |
| `perf/session-analysis-bpmn-tab-switch-load-regression-v1` | perf | REVIEW_BLOCKED | 14 | REVIEW_BLOCKED.md |
| `research/product-actions-ai-ag-ui-protocol-fit-v1` | research | CHANGES_REQUESTED | 15 | **REWORK_REQUEST.md** |
| `tooling/gsd-availability-root-cause-diagnostic-v1` | tooling | (no verdict) | 8 | DIAGNOSTIC_COMPLETE |
| `tooling/gsd-runner-repair-and-agent1-binding-v1` | tooling | (no verdict) | 8 | — |
| `tooling/mcp-servers-inventory-and-repair-v1` | tooling | (no verdict) | 7 | — |
| `tooling/processmap-agent3-ui-review-skill-binding-v1` | tooling | REVIEW_PASS | 6 | — |
| `tooling/project-atlas-server-docs-import-and-triage-v1` | tooling | (no verdict) | 8 | — |
| `tooling/project-atlas-sync-and-rag-bootstrap-v1` | tooling | (no verdict) | 6 | — |
| `uiux/product-actions-registry-ia-layout-rework-v2` | uiux | REVIEW_PASS | 17 | — |
| `uiux/product-actions-registry-workspace-ux-redesign-v1` | uiux | CHANGES_REQUESTED | 17 | **REWORK_REQUEST.md** |

### High-Priority RAG Warnings (CHANGES_REQUESTED / REWORK_REQUEST)

1. `perf/diagram-derived-maps-and-render-boundary-v1` — REWORK_REQUEST.md present
2. `perf/diagram-modeler-drag-hot-path-and-pointermove-suppression-v1` — REWORK_REQUEST.md present
3. `perf/process-stage-baseline-jank-v1` — REWORK_REQUEST.md present
4. `research/product-actions-ai-ag-ui-protocol-fit-v1` — CHANGES_REQUESTED + REWORK_REQUEST.md
5. `uiux/product-actions-registry-workspace-ux-redesign-v1` — CHANGES_REQUESTED + REWORK_REQUEST.md

### Contour Files to Index (per contour)

- `PLAN.md` — canonical plan
- `EXECUTOR_PROMPT.md` / `REVIEWER_PROMPT.md` — prompt contracts
- `EXEC_REPORT.md` — execution findings
- `REVIEW_REPORT.md` — review findings
- `REVIEW_PASS` / `CHANGES_REQUESTED` — verdict marker
- `REWORK_REQUEST.md` — high-priority warning
- `RUNTIME_NAVIGATION.md` / `RUNTIME_PROOF_CHECKLIST.md`
- `STATE.json`
- Any `ROOT_CAUSE`, `SOURCE_MAP`, `PERFORMANCE`, `RUNTIME` reports

---

## C. Docs

Roots: `/opt/processmap-test/docs`, `/opt/processmap-test/PROCESSMAP/HANDOFF`

**Summary:** ~65 files in docs/ + 11 files in PROCESSMAP/HANDOFF/

### Curated Docs List

| Path | Category | Relevance to RAG |
|------|----------|------------------|
| `docs/bpmnstage_factpack.md` | Architecture | critical — BPMN stage contract |
| `docs/processstage_factpack.md` | Architecture | critical — ProcessStage contract |
| `docs/contract_project_api.md` | API Contract | high |
| `docs/contract_project_sessions_api.md` | API Contract | high |
| `docs/contract_session_api.md` | API Contract | high |
| `docs/enterprise_api_contract.md` | API Contract | high |
| `docs/enterprise_factpack_as_is.md` | Architecture | normal |
| `docs/enterprise_target_model_to_be.md` | Architecture | normal |
| `docs/enterprise_migrations_plan.md` | Migration | normal |
| `docs/enterprise_sso_plan.md` | Security | normal |
| `docs/enterprise_user_flows.md` | UX | normal |
| `docs/decompose/D1_contracts.md` | Decomposition | high |
| `docs/decompose/D4_frontend_api_audit.md` | Audit | high |
| `docs/decompose/D5_2_alias_audit_20260305_122334.md` | Audit | normal |
| `docs/decompose/D5_3_alias_audit_20260305_1332.md` | Audit | normal |
| `docs/decompose/templates_bpmn_fragment_factpack.md` | Architecture | high |
| `docs/gsd/discussions-create-flow-entity-form-v1.md` | GSD | normal |
| `docs/gsd/discussions-personal-notification-semantics-and-session-badge-v1.md` | GSD | normal |
| `docs/INTERVIEW_ACTIONS_CATALOG.md` | Catalog | high — interview actions reference |
| `docs/interview_decomposition_audit.md` | Audit | high |
| `docs/interview_graph_acceptance_and_test_plan.md` | Test Plan | high |
| `docs/interview_user_flows_p0_p0p1.md` | UX | normal |
| `docs/rbac_matrix.md` | Security | normal |
| `docs/redis/redis_keys.md` | Operations | low |
| `docs/redis/redis_overview.md` | Operations | low |
| `docs/user_guide.md` | User Guide | low |
| `docs/drawio-layer-product-spec.md` | Product Spec | high |
| `docs/drawio-regression-gate.md` | Test Gate | high |
| `docs/drawio-runtime-baseline.md` | Baseline | high |
| `docs/specs/product-actions-registry-and-export-mvp-spec-v1.md` | Product Spec | high |
| `docs/ui_actions_catalog.md` | Catalog | normal |
| `PROCESSMAP/HANDOFF/DEPLOY_STATUS.md` | Deploy Status | normal |
| `PROCESSMAP/HANDOFF/local-devflow-packaging-automation-v1.md` | Devflow | normal |

### Exclusions from Docs

- `docs/debug/*.json` — raw debug dumps (summarize only)
- `docs/screenshots/*.png` — raw screenshots unless curated
- Stale drafts beyond retention

---

## D. Code Candidates

Roots: `frontend/src` (1105 files), `backend` (282 files), `tools`, `scripts`

### Indexing Priority: Critical

| Path | Type | Module | Risk Tags | Lines (est.) |
|------|------|--------|-----------|--------------|
| `backend/app/routers/rag.py` | router | RAG API | org_isolation | ~150 |
| `backend/app/rag/search.py` | module | BM25 search | internal_api | ~150 |
| `backend/app/rag/chunker.py` | module | BPMN chunker | xml_parsing | ~150 |
| `backend/app/rag/indexer.py` | module | Index pipeline | db_storage | ~150 |
| `backend/app/rag/storage_rag.py` | module | Chunk storage | db_schema | ~150 |
| `frontend/src/features/admin/pages/AdminRagPage.jsx` | page | Admin RAG UI | settings_gated | ~200 |
| `frontend/src/features/admin/hooks/useAdminRagData.js` | hook | Admin RAG data | — | ~100 |
| `frontend/src/components/AppShell.jsx` | component | App shell | orchestration | ~400 |
| `frontend/src/components/ProcessStage.jsx` | component | Process stage | diagram, save | ~600 |
| `frontend/src/features/process/bpmn/stage/load/useBpmnCanvasLifecycle.js` | hook | Canvas lifecycle | load, memory | ~200 |
| `frontend/src/features/process/bpmn/stage/load/useDiagramLoadStateMachine.js` | hook | Load state machine | load, stability | ~300 |
| `frontend/src/features/process/bpmn/save/manualSaveCanonicalXml.js` | module | Save logic | mutation, guard | ~200 |
| `frontend/src/features/process/bpmn/coordinator/createBpmnCoordinator.js` | module | BPMN coordinator | concurrency | ~400 |
| `scripts/generate-build-info.mjs` | script | Build info | version_proof | ~100 |
| `tools/pm-agent-mirror-report.sh` | script | Atlas mirror | sync | ~80 |
| `tools/pm-agent1-planner.sh` | script | Agent launcher | workflow | ~60 |
| `tools/pm-agent2-executor-watch.sh` | script | Agent launcher | workflow | ~60 |
| `tools/pm-agent3-reviewer-watch.sh` | script | Agent launcher | workflow | ~60 |

### Indexing Priority: High

| Path | Type | Module | Risk Tags | Lines (est.) |
|------|------|--------|-----------|--------------|
| `backend/app/main.py` | module | FastAPI app | bootstrap | ~300 |
| `backend/app/models.py` | module | SQLAlchemy models | schema | ~800 |
| `backend/app/settings.py` | module | App settings | config | ~200 |
| `backend/app/routers/sessions.py` | router | Sessions API | save, revision | ~400 |
| `backend/app/routers/projects.py` | router | Projects API | workspace | ~300 |
| `backend/app/routers/product_actions_registry.py` | router | Registry API | rbac | ~300 |
| `backend/app/ai/product_actions_suggest.py` | module | AI suggest | ai_integration | ~200 |
| `backend/app/ai/prompt_registry.py` | module | Prompt registry | ai_integration | ~150 |
| `backend/tests/test_rag_api.py` | test | RAG tests | coverage | ~200 |
| `backend/tests/test_rag_bm25.py` | test | BM25 tests | coverage | ~150 |
| `frontend/src/app/router/routes.jsx` | module | App routes | navigation | ~200 |
| `frontend/src/features/process/bpmn/stage/decor/decorManager.js` | module | Decor overlays | perf | ~400 |
| `frontend/src/features/process/bpmn/stage/interaction/diagramPointerMoveCoalescer.js` | module | Pointer coalescing | perf, drag | ~150 |
| `frontend/src/features/process/bpmn/stage/interaction/diagramDragSideEffectGuard.js` | module | Drag guard | perf, drag | ~150 |
| `frontend/src/features/process/bpmn/runtime/zoomScrollLifecycle.js` | module | Zoom lifecycle | ux | ~200 |
| `frontend/src/features/process/drawio/controllers/useDrawioEditorBridge.js` | hook | DrawIO bridge | integration | ~300 |

### Indexing Priority: Normal

- All other backend routers (`admin.py`, `explorer.py`, `notes.py`, `auto_pass.py`, etc.)
- Frontend feature modules: `features/notes/`, `features/explorer/`, `features/auth/`, `features/admin/`
- Frontend test files (as evidence of expected behavior)
- Build and CI scripts in `scripts/`
- Docker and deployment configs

### Code Exclusions (hard)

- `node_modules/`, `frontend/dist/`, `.git/`
- `__pycache__/`, `*.pyc`
- Raw binary assets (images, fonts)
- Minified bundles

---

## Totals

| Source Root | Files Scanned | Indexed Est. | Priority |
|-------------|---------------|--------------|----------|
| Project Atlas | 727 | ~200 (curated) | critical/high |
| Planning Contours | 40 contours | all contour reports | critical |
| Docs | ~76 | ~35 (curated) | high/normal |
| Code (frontend/src) | 1105 | ~80 (key files) | critical/high |
| Code (backend) | 282 | ~50 (key files) | critical/high |
| Tools + Scripts | ~60 | ~20 (key files) | normal |

