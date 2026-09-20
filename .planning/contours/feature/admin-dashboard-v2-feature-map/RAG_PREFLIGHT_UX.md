# ProcessMap Agent RAG Preflight

## Input
- **role**: executor
- **contour**: feature/admin-dashboard-v2-feature-map
- **area/query**: admin dashboard ux polish / UX полировка сводка компоновка визуальная иерархия spacing
- **generated_at**: 2026-09-20T21:36:30.643Z

## Structured Facts

### Agent Rules
- [critical] Agent 1 Planner must use GSD discipline (FORBIDDEN: Skip planning documentation or proceed without bounded scope) (REQUIRED: Run GSD checks, create PLAN.md, define acceptance criteria, write STATE.json)
- [critical] Agent 3 Reviewer must use GSD discipline (FORBIDDEN: Approve without independent validation or skip runtime proof) (REQUIRED: Run GSD checks, verify source/runtime truth, run independent validation)
- [critical] Agent 3 must verify fresh :5180 runtime for UI/runtime work (FORBIDDEN: Review UI/runtime contour without verifying the runtime is actually serving) (REQUIRED: curl -I http://clearvestnic.ru:5180 and confirm HTTP 200 with no-cache headers)
- [high] Agent 3 must test the exact user scenario (FORBIDDEN: Substitute a different scenario or skip the exact reproduction steps) (REQUIRED: Reproduce the exact steps described in the contour PLAN.md acceptance criteria)
- [critical] Diagram performance review must test real mouse drag, not only programmatic zoom/click (FORBIDDEN: Approve based only on synthetic zoom, click, or programmatic tests without real drag) (REQUIRED: Perform actual pointer drag on the BPMN canvas and observe jank/frame drops)
- [critical] No PR, merge, or deploy without explicit user command (FORBIDDEN: Create PR, merge, push, or deploy without explicit user request) (REQUIRED: Wait for explicit user approval before git push, PR creation, or deploy)
- [high] No product runtime code changes in RAG tooling contours (FORBIDDEN: Modify frontend/src/, backend/app/, or any product runtime file during RAG work) (REQUIRED: Keep changes under tools/rag/, docs/rag/, .planning/contours/ only)
- [critical] RAG is read-only suggestion/context layer (FORBIDDEN: Auto-mutate code, auto-save files, write BPMN XML, or apply Product Actions automatically based on RAG output) (REQUIRED: Treat RAG results as suggestions, warnings, and references only)

### Contour Facts
- architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true
- feature/processmap-agent-rag-source-registry-and-index-policy-v1: formal=REVIEW_PASS, user_visible=solved, accepted=true

### Decisions
- RAG is a read-only suggestion and context layer. (All agents, all contours, all RAG usage)
- RAG must not auto-mutate any file. (All RAG tooling, all agent preflight integrations)
- RAG must not write or mutate BPMN XML. (All RAG contours, all agent contexts)
- AI drafts are not canonical source truth. (All agents, all contour reports, all Project Atlas docs)
- Product Actions durable truth source is interview.analysis.product_actions[]. (Product feature contours, roadmap planning)
- Product Actions must not be written into BPMN XML. (All backend/API work involving Product Actions and BPMN)
- Version marker must not overlay the BPMN canvas. (All diagram/UI contours)
- Version/update row should increment visibly. (Save, deploy, and version contours)
- Large god files require decomposition-first before adding new logic. (All backend and frontend code changes)
- For TO-BE format, follow only the user-provided document; no invented terms unless marked hypothesis. (All TO-BE modeling and process design contours)

## Supporting Documents

### #1 — F. Overall hierarchy — ✅ PASS
- **score**: 26.744
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/polish/product-actions-registry-final-ui-v1/REVIEW_REPORT.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: path_match
- **snippet**:
```
- Чёткая *визуальная* *иерархия* с горизонтальными разделителями. - NO card chaos: строки и метрики без фонов/теней/рамок. - Один контейнер `.productActionsRegistryPage`, чистый интерьер.
```

### #2 — 3. Отступ breadcrumb 12px
- **score**: 26.511
- **path**: `/opt/processmap-test/docs/obsidian_fallback/project_atlas_updates/fix-sub-process-navigation/16_Журнал решений.md`
- **source/category**: docs-curated / docs
- **why_matched**: 
- **snippet**:
```
**Решение:** панель breadcrumb отодвинута от верхнего и левого края рабочей области на `12px`. **Причина:** *визуальная* *полировка* — панель не должна прилипать к хедеру и краям канваса. **Реализация:** `.subprocessBreadcrumbsOnCanvas { top: 12px; left: 12px; }`.
```

### #3 — Текущий пользовательский feedback
- **score**: 25.789
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/analytics-registry-layout-density-and-visual-system-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: 
- **snippet**:
```
Предыдущий контур технически прошел runtime review, но пользователь отверг визуальный результат: экран работает, но не выглядит как *polish*ed product screen. Основные проблемы: - Analytics Hub и Product Actions Registry слишком узкие внутри большого пустого рабочего пространства. - Страница выглядит как маленькая центрированная карточка, вставленная в огромный blank canvas. - *Визуальная* *иерархия* слабая: header, scope, metrics, filters и table читаются одинаково серыми. - Пользователь не может быстро зацепиться за основную рабочую область. - Таблица Product Actions Registry недостаточно доминиру
```

### #4 — Agent 3 / Worker — Work Package B (Independent UX / data-safety)
- **score**: 24.910
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/feature/process-analytics-hub-and-registry-navigation-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: heading_match
- **snippet**:
```
## Agent 3 / Worker — Work Package B (Independent *UX* / data-safety)
- Независимо инспектировать текущий Product Actions Registry и Analytics Hub source. - Создать *UX* acceptance checklist и data-safety report. - Проверить, что Analytics Hub не показывает фейковые *dashboard*-числа. - Подготовить bounded copy/placeholder rules для «Реестра свойств», «Дашбордов», «Экспорта». - При необходимости — bounded CSS/*UX* *polish*, non-conflicting test fixtures. - Проверить planned selectors/routes из source map. - Подготовить runtime validation checklist для Agent 4. - Создать WORKER_3_REPORT.md, WORKER_3_DONE…
```

### #5 — Пользовательская проблема
- **score**: 24.270
- **path**: `/srv/obsidian/project-atlas/ProcessMap/AgentReports/uiux/product-actions-registry-polished-table-layout-v1/PLAN.md`
- **source/category**: project-atlas / project_atlas
- **why_matched**: 
- **snippet**:
```
Страница Product Actions Registry функционально работает, но пользователь отвергает визуальное качество: текущая *компоновка* ощущается перегруженной, недостаточно иерархичной и недостаточно table-first. Нужен bounded UI *polish* без redesign глобальной оболочки ProcessMap.
```

### #6 — UI/UX Design System — Analytics Dashboard Redesign
- **score**: 23.624
- **path**: `/opt/processmap-test/.planning/contours/feature/analytics-dashboard-redesign/DESIGN_SYSTEM.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match
- **snippet**:
```
[contour: analytics-*dashboard*-redesign] ## UI/*UX* Design System — Analytics *Dashboard* Redesign
Contour: `feature/analytics-*dashboard*-redesign` Product Type: Analytics *Dashboard* Generated: 2026-06-24
```

### #7 — PLAN — Analytics Dashboard UI/UX Redesign
- **score**: 23.491
- **path**: `/opt/processmap-test/.planning/contours/feature/analytics-dashboard-redesign/PLAN.md`
- **source/category**: planning-contours / contour
- **why_matched**: exact_contour_id, path_match, heading_match
- **snippet**:
```
[contour: analytics-*dashboard*-redesign] ## PLAN — Analytics *Dashboard* UI/*UX* Redesign
Contour: `feature/analytics-*dashboard*-redesign` Branch: `feature/analytics-*dashboard*-redesign` from `new-origin/main` Created: 2026-06-24
```

## Required Gates
- [ ] Source/runtime truth confirmed before implementation
- [ ] Bounded contour scope respected
- [ ] No product runtime changes unless explicitly allowed
- [ ] No secrets printed in output
- [ ] No auto-mutation of BPMN XML or Product Actions
- [ ] RAG read-only boundary respected
- [ ] Runtime evidence collected for Agent 3

## Warnings
- ⚠️ No runtime facts matched query — runtime proof may be missing.
- ⚠️ REMINDER: Do not print secrets. Preflight output may contain paths but not credentials.

## Suggested Next Queries
- ```bash
node tools/rag/pm-rag-search.mjs "admin dashboard ux polish" --top-k 5
```
- ```bash
node tools/rag/pm-rag-search-facts.mjs "admin dashboard ux polish" --top-k 8 --json
```
- ```bash
node tools/rag/pm-rag-agent-preflight.mjs --role executor --contour "feature/admin-dashboard-v2-feature-map" --area "admin dashboard ux polish" --format md
```
- ```bash
node tools/rag/pm-rag-validate-facts.mjs
```
- ```bash
node tools/rag/pm-rag-run-validation-queries.mjs --top-k 8
```
