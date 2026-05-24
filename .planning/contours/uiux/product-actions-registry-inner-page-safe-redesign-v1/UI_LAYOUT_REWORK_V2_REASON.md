# UI_LAYOUT_REWORK_V2_REASON

**Контур:** `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
**Дата:** 2026-05-17  
**Run ID:** `20260517T134855Z`  
**Статус:** `CHANGES_REQUESTED`

## Почему нужен новый rework

Последний runtime-скриншот и пользовательский фидбек показывают, что страница «Реестр действий с продуктом» всё ещё воспринимается как визуально хаотичная. Предыдущая правка улучшила доступность runtime и базовый порядок блоков, но не закрыла главную UX-проблему: метрики и вторичные блоки продолжают конкурировать с таблицей, а «Источники данных» визуально сливаются с основным реестром.

Текущий rework должен быть безопасной донастройкой существующей структуры, а не новым редизайном ProcessMap.

## Зафиксированный пользовательский фидбек

1. Страница всё ещё визуально хаотична.
2. Карточки метрик слишком крупные, особенно «После фильтров».
3. Метрики не должны доминировать; они должны компактно находиться под scope selector.
4. «Вернуться» должен оставаться видимым и яснее читаться как навигационное действие.
5. CSV/XLSX могут остаться на противоположной стороне как компактные utility actions.
6. Scope markers Workspace / Проект / Сессия должны визуально напоминать Explorer-style labeling/marking.
7. «Источники данных» нужно намного яснее отделить от основной таблицы «Реестр действий».
8. Таблица реестра и sources block должны ощущаться двумя разными секциями, а не одним листом.
9. Главный фокус страницы должен оставаться на таблице реестра действий.
10. Sources block должен быть заметнее и выразительнее, но вторичнее основной таблицы.

## Что считается ошибкой rework

- Метрики остаются крупными карточками и конкурируют с таблицей.
- «После фильтров» выделен сильнее остальных counters.
- «Вернуться» выглядит как вторичная маленькая утилита и теряется рядом с экспортом.
- CSV/XLSX становятся главными actions страницы.
- Scope selector выглядит как обычный segmented control без Explorer-like semantic labels.
- «Источники данных» визуально продолжают таблицу без самостоятельного заголовка, отступа или фона.
- Sources block становится визуально тяжелее основной таблицы.
- Любые изменения backend/schema/BPMN/RAG/Product Actions durable truth.

## RAG / GSD контекст

RAG preflight выполнен:

```bash
cd /opt/processmap-test
node tools/rag/pm-rag-agent-preflight.mjs \
  --role planner \
  --contour "uiux/product-actions-registry-inner-page-safe-redesign-v1" \
  --area "product actions registry ui layout hierarchy section separation explorer semantics" \
  --format md \
  --out .planning/contours/uiux/product-actions-registry-inner-page-safe-redesign-v1/RAG_PREFLIGHT_PLANNER.md
```

Учтённые правила:
- RAG остаётся read-only context layer.
- Product Actions durable truth: `interview.analysis.product_actions[]`.
- Product Actions не пишутся в BPMN XML.
- Agent 1 не пишет product code.
- Runtime-review для UI должен проверять свежий `:5180`.

