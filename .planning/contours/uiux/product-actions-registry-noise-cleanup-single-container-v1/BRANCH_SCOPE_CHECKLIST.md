# Branch Scope Checklist

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- текущая ветка чекаута: `fix/lockfile-sync-test` (грязная)
- целевая main для будущего PR: `main`

## A. Состояние дерева на момент планирования

`git status` показал большое количество M-файлов из других контуров (AppShell, ProcessStage, BpmnStage, InterviewStage, TopBar, WorkspaceExplorer, BPMN CSS, legacy CSS, перформанс-патчи). Это **не** часть scope нашего контура.

## B. Обязательное действие Worker 2 (выбрать одно)

### Вариант 1 — Clean worktree (предпочтительно)

```bash
# Создать чистый worktree от origin/main:
git fetch origin
git worktree add -B uiux/product-actions-registry-noise-cleanup-single-container-v1 \
  ../pm-registry-noise-cleanup origin/main
cd ../pm-registry-noise-cleanup
```

- Применять только bounded registry-правки (см. `UX_SPEC_IMPLEMENTATION_MAP.md` §A и `COMPONENT_MAPPING_REQUIREMENTS.md` §A).
- Diff на финал: только файлы из white-list ниже + `frontend/src/config/appVersion.js`.
- Записать SHA базового commit и итоговый diff-summary в `WORKER_2_REPORT.md`.

### Вариант 2 — Justify current checkout

Если по объективной причине нельзя сменить worktree:

- В `WORKER_2_REPORT.md` явно перечислить: какие из текущих M-файлов «уже были» до старта контура (НЕ являются делом Worker 2) и какие — добавлены Worker 2 строго в скоупе.
- Финальный коммит контура должен содержать только registry-файлы. Чужие M-файлы коммитить **запрещено**.
- Если коммит вынужденно затрагивает не registry — это блокер: писать `EXEC_PART_1_BLOCKED.md`.

## C. White-list файлов, которые может менять Worker 2

```
frontend/src/components/process/analysis/ProductActionsRegistryPage.jsx
frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryHeader.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryFilters.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryMetrics.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx
frontend/src/components/process/analysis/registry/ProductActionsRegistryPagination.jsx
frontend/src/components/process/analysis/registry/index.js
frontend/src/styles/<локальный registry css, если уже есть>
frontend/src/config/appVersion.js
.planning/contours/uiux/product-actions-registry-noise-cleanup-single-container-v1/**
PROCESSMAP/HANDOFF/<контур-специфичные хендоффы, если потребуются>
```

Тесты `*.test.mjs` для соответствующих файлов **можно** обновлять только если фактически меняется публичный API/DOM, и только в скоупе реестра.

## D. Black-list (категорически нельзя)

```
frontend/src/components/AppShell.jsx
frontend/src/components/TopBar.jsx
frontend/src/components/ProcessStage.jsx
frontend/src/components/process/BpmnStage.jsx
frontend/src/components/process/InterviewStage.jsx
frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx
frontend/src/features/explorer/WorkspaceExplorer.jsx
frontend/src/features/process/**
frontend/src/styles/app/02/02-02-bpmn-viewer-core.css
frontend/src/styles/app/02/02-06-bpmn-dark-theme.css
frontend/src/styles/app/05/05-02-bpmn-text-contrast.css
frontend/src/styles/app/06-final-structure.css
frontend/src/styles/legacy/legacy_bpmn.css
backend/**
schema/**
*.bpmn / *.xml
tools/rag/**
```

## E. Гайд по коммитам

- Один логический коммит на контур (или max 2–3 при необходимости): `fix(frontend): registry single-container visual noise cleanup`.
- Сообщение коммита должно перечислять затронутые файлы из white-list.
- Не делать `git add -A` — только точечно по white-list.
