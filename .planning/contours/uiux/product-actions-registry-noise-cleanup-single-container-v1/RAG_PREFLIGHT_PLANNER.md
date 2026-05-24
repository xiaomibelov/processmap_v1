# RAG Preflight — Planner

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- launcher_run_id: `20260518T164643Z-83747`
- role: planner
- area: ProcessMap planning context
- generated_at: 2026-05-18T16:47:50.703Z

## Команда

```bash
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "uiux/product-actions-registry-noise-cleanup-single-container-v1" \
  --area "ProcessMap planning context" \
  --format md --top-k 10
```

## Использованные факты

- RAG — read-only слой подсказок. Не используется для авто-мутаций.
- Agent 1 / Planner обязан: GSD-дисциплина, PLAN.md, ограниченный scope, acceptance criteria, STATE.json.
- Agent 4 / Reviewer обязан: runtime-доказательство на :5180, фреш-контекст браузера, точный сценарий из PLAN.md.
- Категорически запрещено вносить продуктовые правки рантайма из RAG-контуров.
- Для UI-контуров обязателен fresh-context curl + визуальная валидация.

## Релевантные предыдущие контуры

- `uiux/product-actions-registry-single-surface-visual-system-v1` — предыдущая попытка визуального объединения реестра (есть PLAN.md, EXEC_REPORT.md в Obsidian).
- `uiux/product-actions-registry-inner-page-safe-redesign-v1` — попытка безопасного редизайна внутренней страницы, помечена CHANGES_REQUESTED.
- `uiux/product-actions-registry-polished-table-layout-v1`, `uiux/product-actions-registry-workspace-ux-redesign-v1` — связанные попытки оформления таблицы.
- `architecture/processmap-agent-rag-knowledge-layer-bootstrap-plan-v1` — каноничные правила работы с RAG-контуром.

## Решения, принятые на основании preflight

- Сохраняем Analytics Hub (`ProcessAnalyticsHub.jsx`); «Реестр действий» — внутренний модуль.
- Реальные файлы реестра расположены в `frontend/src/components/process/analysis/` и подпапке `registry/`, а не в гипотетическом `src/components/Header.tsx` / `MainCard.tsx`. Маппинг — в `COMPONENT_MAPPING_REQUIREMENTS.md`.
- Без новых зависимостей и без миграций стека (репозиторий — JSX/CSS, не TS/Tailwind/shadcn в этих файлах).
- Agent 4 обязателен runtime proof на `http://clearvestnic.ru:5180` со свежим cache-buster.

## Required Gates (из preflight)

- [x] GSD discipline recorded (см. `GSD_CONTEXT_USED.md`)
- [x] Source/runtime truth captured (через инспекцию `frontend/src/components/process/analysis/`)
- [x] Bounded scope defined in PLAN.md
- [x] Acceptance criteria defined (`UX_SPEC_IMPLEMENTATION_MAP.md`, `RUNTIME_PROOF_CHECKLIST.md`)
- [x] User rejection facts reviewed (визуальный шум, разрозненные стили)
- [x] No product code written by Agent 1
- [x] No merge/deploy/PR without explicit approval

## Warnings (учтены)

- RAG preflight не нашёл runtime-фактов — Agent 4 обязан добыть их сам через fresh :5180 curl + визуальную проверку.
- Секреты не печатать. Preflight output чист.
