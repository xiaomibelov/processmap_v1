# Full Test and Check Inventory — Docker Truth Baseline

Date: 2026-03-10

This inventory is captured from the current Docker-backed working tree.
Statuses below distinguish between:
- `green-now`: rerun in this migration-prep pass and passed
- `known-green`: previously accepted and treated as load-bearing, not rerun in this pass
- `partial`: accepted code change exists, but browser proof is not fully closed in the current harness
- `not-rerun`: present and should travel with the project, but not executed in this pass

## 1. Backend tests

### 1.1 Core backend deployment-relevant tests

| Test | Status | Must keep | Run |
|---|---|---|---|
| `backend/tests/test_route_compatibility.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_route_compatibility -q` |
| `backend/tests/test_org_invites.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_org_invites -q` |
| `backend/tests/test_org_invites_email_flow.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_org_invites_email_flow -q` |
| `backend/tests/test_enterprise_workspace_endpoint.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_enterprise_workspace_endpoint -q` |
| `backend/tests/test_enterprise_org_scope_api.py` | not-rerun | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_enterprise_org_scope_api -q` |
| `backend/tests/test_project_membership_scope.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_project_membership_scope -q` |
| `backend/tests/test_workspace_access_controls.py` | not-rerun | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_workspace_access_controls -q` |
| `backend/tests/test_bpmn_meta.py` | green-now | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_bpmn_meta -q` |
| `backend/tests/test_auth_jwt_flow.py` | not-rerun | yes | `PYTHONPATH=backend python3 -m unittest backend.tests.test_auth_jwt_flow -q` |
| `backend/tests/test_drawio_persisted_state_sanitize.py` | not-rerun | keep | `PYTHONPATH=backend python3 -m unittest backend.tests.test_drawio_persisted_state_sanitize -q` |

### 1.2 Additional backend suite present in the working product

| Test file | Status | Must keep |
|---|---|---|
| `backend/tests/test_ai_questions_node_stage_context.py` | not-rerun | keep |
| `backend/tests/test_ai_questions_step_sync.py` | not-rerun | keep |
| `backend/tests/test_audit_log.py` | not-rerun | keep |
| `backend/tests/test_audit_retention_cleanup.py` | not-rerun | keep |
| `backend/tests/test_auto_pass_engine.py` | not-rerun | keep |
| `backend/tests/test_bpmn_put_redis_lock.py` | not-rerun | keep |
| `backend/tests/test_bpmn_text_annotation.py` | not-rerun | keep |
| `backend/tests/test_deepseek_retry.py` | not-rerun | keep |
| `backend/tests/test_e2e_interview_diagram_xml.py` | not-rerun | keep |
| `backend/tests/test_enterprise_reports_scope_delete.py` | not-rerun | keep |
| `backend/tests/test_path_report_api.py` | not-rerun | keep |
| `backend/tests/test_path_report_tpl_v2.py` | not-rerun | keep |
| `backend/tests/test_redis_cache_workspace_tldr.py` | not-rerun | keep |
| `backend/tests/test_redis_lock.py` | not-rerun | keep |
| `backend/tests/test_rtiers_inference.py` | not-rerun | keep |
| `backend/tests/test_session_title_questions.py` | not-rerun | keep |
| `backend/tests/test_storage_sqlite_scope.py` | not-rerun | keep |
| `backend/tests/test_templates_rbac.py` | not-rerun | keep |

## 2. Frontend unit / DOM / invariant tests

### 2.1 Load-bearing frontend checks

| Test/check | Status | Must keep | Run |
|---|---|---|---|
| `frontend build` | green-now | yes | `cd frontend && npm run build` |
| `src/features/process/drawio/runtime/drawioOverlayMatrix.test.mjs` | not-rerun in this pass; previously green | yes | `cd frontend && node --test src/features/process/drawio/runtime/drawioOverlayMatrix.test.mjs` |
| `src/features/process/drawio/runtime/drawioOverlayState.test.mjs` | not-rerun in this pass; previously green | yes | `cd frontend && node --test src/features/process/drawio/runtime/drawioOverlayState.test.mjs` |
| `src/features/process/drawio/unifiedEditingContract.test.mjs` | not-rerun in this pass; previously green | yes | `cd frontend && node --test src/features/process/drawio/unifiedEditingContract.test.mjs` |
| `src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs` | not-rerun | yes | `cd frontend && node --test src/features/process/drawio/runtime/useDrawioPersistHydrateBoundary.test.mjs` |
| `src/features/session-meta/sessionMetaBoundary.test.mjs` | not-rerun | yes | `cd frontend && node --test src/features/session-meta/sessionMetaBoundary.test.mjs` |
| `src/features/process/overlay/models/buildOverlayPanelModel.test.mjs` | not-rerun | keep | `cd frontend && node --test src/features/process/overlay/models/buildOverlayPanelModel.test.mjs` |
| `src/lib/api.enterprise-admin.test.mjs` | not-rerun | keep | `cd frontend && node --test src/lib/api.enterprise-admin.test.mjs` |

### 2.2 Additional frontend tests present in the working tree

| Test file | Status | Must keep |
|---|---|---|
| `frontend/src/features/process/drawio/controllers/useDrawioEditorBridge.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/drawio/drawioDocXml.test.mjs` | not-rerun | keep |
| `frontend/src/features/process/drawio/drawioRuntimeGeometry.test.mjs` | not-rerun | keep |
| `frontend/src/features/process/drawio/drawioRuntimeText.test.mjs` | not-rerun | keep |
| `frontend/src/features/process/drawio/drawioSelectedObjectUx.test.mjs` | not-rerun | keep |
| `frontend/src/features/process/drawio/drawioSvg.test.mjs` | not-rerun | keep |
| `frontend/src/features/process/drawio/runtime/drawioOverlayPointerOwnership.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/drawio/runtime/drawioPlacementPreview.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/drawio/runtime/drawioRuntimePlacement.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/drawio/domain/drawioVisibilitySelectionContract.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/drawio/runtime/useDrawioOverlayInteraction.dom.test.mjs` | not-rerun | yes |
| `frontend/src/features/process/stage/ui/fileInputEvent.test.mjs` | not-rerun | keep |

## 3. Browser / e2e tests

### 3.1 Load-bearing migration acceptance subset

| Spec/script | Status | Must keep | Run |
|---|---|---|---|
| `scripts/drawio_regression_gate.sh` | known-green | yes | `./scripts/drawio_regression_gate.sh --browser` |
| `frontend/e2e/drawio-browser-runtime-anchoring.spec.mjs` | known-green | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-browser-runtime-anchoring.spec.mjs` |
| `frontend/e2e/drawio-runtime-tool-placement.spec.mjs` | known-green | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-runtime-tool-placement.spec.mjs` |
| `frontend/e2e/drawio-stage1-boundary-smoke.spec.mjs` | known-green | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-stage1-boundary-smoke.spec.mjs` |
| `frontend/e2e/drawio-fresh-session-closure.spec.mjs` | partial | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/drawio-fresh-session-closure.spec.mjs` |
| `frontend/e2e/invite-flow-enterprise.spec.mjs` | known-green | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/invite-flow-enterprise.spec.mjs` |
| `frontend/e2e/accept-invite-enterprise.spec.mjs` | not-rerun | keep | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/accept-invite-enterprise.spec.mjs` |
| `frontend/e2e/org-settings-invites-audit.spec.mjs` | known-green | keep | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_PROFILE=enterprise npx playwright test e2e/org-settings-invites-audit.spec.mjs` |
| `frontend/e2e/workspace-dashboard-smoke.spec.mjs` | not-rerun | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 npx playwright test e2e/workspace-dashboard-smoke.spec.mjs` |
| `frontend/e2e/workspace-home-ux.spec.mjs` | not-rerun | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 npx playwright test e2e/workspace-home-ux.spec.mjs` |
| `frontend/e2e/create-project-and-session.spec.mjs` | not-rerun | yes | `cd frontend && E2E_APP_BASE_URL=http://127.0.0.1:5177 npx playwright test e2e/create-project-and-session.spec.mjs` |

### 3.2 Draw.io re-enter explicit capture

| Artifact | Status | Must keep | Note |
|---|---|---|---|
| `frontend/src/components/process/BpmnStage.jsx` | code-present | yes | emits settled canvas snapshot after import/fit |
| `frontend/e2e/drawio-fresh-session-closure.spec.mjs` | partial | yes | browser proof still noisy in current session-open harness |
| `frontend/e2e/helpers/diagramReady.mjs` | partial-support | yes | evolved explorer/session-open helper |

### 3.3 Full e2e spec set present in the working tree

The following specs also travel with the project and should not be dropped during packaging:

`accept-invite-enterprise.spec.mjs`, `ai-badge-live-update.spec.mjs`, `ai-button-opens-panel-and-shows-loading.spec.mjs`, `ai-cache-replay.spec.mjs`, `ai-command-mode.spec.mjs`, `ai-nonblocking-tabs.spec.mjs`, `ai-questions-attach-to-node-and-show-badge.spec.mjs`, `ai-questions-bind.spec.mjs`, `ai-questions-diagram-badge.spec.mjs`, `ai-ui-status.spec.mjs`, `auth-routing-login.spec.mjs`, `batch-transform-notes.spec.mjs`, `binding-assistant.spec.mjs`, `bpmn-roundtrip-big.spec.mjs`, `bpmn-runtime-reliability.spec.mjs`, `change-element-preserves-size-notes.spec.mjs`, `coverage-matrix.spec.mjs`, `create-project-and-session.spec.mjs`, `derive-actors-from-lanes.spec.mjs`, `diagram-dark-context-icons.spec.mjs`, `diagram-playback-route.spec.mjs`, `diagram-save-hard-refresh.spec.mjs`, `diagram-save-tab-switch.spec.mjs`, `diagram-tabs-autosave.spec.mjs`, `diagram-zoom-controls.spec.mjs`, `doc-includes-multiple-text-annotations.spec.mjs`, `drawio-browser-performance-trace.spec.mjs`, `drawio-browser-runtime-anchoring.spec.mjs`, `drawio-fresh-session-closure.spec.mjs`, `drawio-ghost-materialization-boundary.spec.mjs`, `drawio-overlay-runtime-entry-contract.spec.mjs`, `drawio-overlay-zoom-pan.spec.mjs`, `drawio-pan-jitter-coupling.spec.mjs`, `drawio-runtime-materialization-boundary.spec.mjs`, `drawio-runtime-perf-evidence.spec.mjs`, `drawio-runtime-tool-placement.spec.mjs`, `drawio-smoke-edit-delete-reload-zoom-pan.spec.mjs`, `drawio-stage1-boundary-smoke.spec.mjs`, `drawio-unified-editing-contract.spec.mjs`, `drawio-visual-scale-parity.spec.mjs`, `export-gate.spec.mjs`, `hybrid-basic-edit-delete-reload.spec.mjs`, `hybrid-layer-delete-reload.spec.mjs`, `hybrid-layer-drawio-codec.spec.mjs`, `hybrid-layer-layers.spec.mjs`, `insert-between.spec.mjs`, `interview-ai-lanes-actions.spec.mjs`, `interview-bpmn-node-type-icons.spec.mjs`, `interview-branch-view-toggle.spec.mjs`, `interview-dod-snapshot-consistency.spec.mjs`, `interview-flow-tier-ux.spec.mjs`, `interview-gateway-branches-afbb.spec.mjs`, `interview-lane-visual-focus.spec.mjs`, `interview-order-toggle.spec.mjs`, `interview-paths-route-layout.spec.mjs`, `interview-paths-stability-afbb.spec.mjs`, `interview-steps-create.spec.mjs`, `interview-steps-insert-between-delete.spec.mjs`, `interview-steps-link.spec.mjs`, `interview-subprocess-group.spec.mjs`, `interview-tier-visualization.spec.mjs`, `interview-to-diagram-keeps-bpmn.spec.mjs`, `interview-to-diagram-keeps-visible-and-actors.spec.mjs`, `interview-to-diagram-layout-gate.spec.mjs`, `interview-to-diagram-stability.spec.mjs`, `interview-view-mode-toggle.spec.mjs`, `interview-when-roundtrip.spec.mjs`, `interview-xml-diagram-no-rollback.spec.mjs`, `interview-xml-diagram-tabchain.spec.mjs`, `invite-flow-enterprise.spec.mjs`, `left-panel-stays-collapsed-on-diagram-click.spec.mjs`, `left-panel-toggle.spec.mjs`, `manual-snapshots-accumulate.spec.mjs`, `mcp-wiring-smoke.spec.mjs`, `notes-history.spec.mjs`, `notes-per-element.spec.mjs`, `notes-templates.spec.mjs`, `notes-tldr.spec.mjs`, `org-settings-invites-audit.spec.mjs`, `org-switcher.spec.mjs`, `playback-gateways-panel.spec.mjs`, `quality-lint.spec.mjs`, `quality-mode.spec.mjs`, `reload-restores-from-snapshots.spec.mjs`, `reports-delete-enterprise.spec.mjs`, `reports-persistence-afbb.spec.mjs`, `robotmeta-save-reload.spec.mjs`, `snapshot-versions-accumulate.spec.mjs`, `snapshot-versions-big-diagram-restore.spec.mjs`, `tab-matrix-big-diagram-no-rollback.spec.mjs`, `tab-no-auto-rollback.spec.mjs`, `tab-transition-matrix-big.spec.mjs`, `tab-transition-matrix.spec.mjs`, `template-packs-save-insert.spec.mjs`, `templates-basic-add-apply.spec.mjs`, `templates-bpmn-fragment-cross-session.spec.mjs`, `templates-folders-menu-smoke.spec.mjs`, `templates-hybrid-stencil-placement.spec.mjs`, `tldr-card-smoke.spec.mjs`, `topbar-layout-brand-ai-account.spec.mjs`, `versions-semantic-diff.spec.mjs`, `workspace-dashboard-smoke.spec.mjs`, `workspace-home-ux.spec.mjs`.

## 4. Build / smoke / runtime checks

| Check | Status | Must keep | Run |
|---|---|---|---|
| docker compose config | green-now | yes | `docker compose config -q` |
| frontend web root | green-now | yes | `curl -I http://127.0.0.1:5177/` |
| backend health | green-now | yes | `curl -s http://127.0.0.1:8011/api/health` |
| backend import sanity | green-now | yes | `PYTHONPATH=backend python3 - <<'PY'\nfrom app.main import app\nprint(app.title)\nPY` |
| deploy bootstrap script syntax | pending rerun in this pass | yes | `bash -n deploy/scripts/server_bootstrap.sh` |
| deploy first-deploy script syntax | pending rerun in this pass | yes | `bash -n deploy/scripts/server_first_deploy.sh` |
| deploy update script syntax | pending rerun in this pass | yes | `bash -n deploy/scripts/server_update.sh` |
| deploy smoke script syntax | pending rerun in this pass | yes | `bash -n deploy/scripts/server_smoke.sh` |

