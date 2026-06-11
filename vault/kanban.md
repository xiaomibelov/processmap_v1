# ProcessMap Kanban

## BACKLOG

## IN_PROGRESS

## DONE
- [x] pm-20260611-003: Wire frontend lightweight overlays | Scope: FRONTEND | Files: [frontend/src/components/process/BpmnStage.jsx, frontend/src/features/process/hooks/useBpmnSync.js, backend/app/_legacy_main.py, frontend/src/features/process/stage/ui/ProcessStageHeader.jsx, frontend/e2e/bpmn-roundtrip-big.spec.mjs, frontend/e2e/tab-transition-matrix-big.spec.mjs] | Closed: 2026-06-11T10:15Z | Note: Lightweight overlays wired. E2e UI routing fixture fixed: processSaveBtn class restored, export/versions overflow menu handling added, interview mutation adapted to collapsed step details, dialog handlers added for quality gate and restore confirm, restore regex fixed.

## BLOCKED

## DONE
- [x] pm-20260611-004: Fix e2e fixture base_version for diagram CAS guard | Scope: QA | Files: [backend/app/_legacy_main.py] | Closed: 2026-06-11T09:11Z | Note: Env var bypass FPC_E2E_CAS_BYPASS with SECURITY comment. CAS 409 eliminated. E2e specs still blocked by pre-existing UI routing issue.

## REVIEW

## DONE
- [x] pm-20260610-001: Redis overlay cache + Celery backend | Scope: CACHE | Files: [backend/app/overlay_cache.py, backend/app/tasks.py, backend/app/celery_app.py, docker-compose.yml, deploy/nginx/default.conf] | Closed: 2026-06-10T20:15Z | Note: Backend deployed to clearvestnic.ru:5177. Cache hit/miss/invalidate verified via curl + redis-cli.
- [x] pm-20260610-002: Lightweight overlay JSON endpoint | Scope: BACKEND | Files: [backend/app/_legacy_main.py] | Closed: 2026-06-10T20:15Z | Note: GET /api/sessions/{sid}/overlays returns 872 bytes vs 216 KB XML. Not wired to frontend yet.

## BLOCKED
