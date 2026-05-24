# REWORK_REQUEST - Agent 4

Контур: `uiux/product-actions-registry-inner-page-safe-redesign-v1`  
Run id: `20260517T134517Z-85981`  
Время: `2026-05-17T14:34:29Z`

## Причина

Runtime `:5180` отдаёт актуальную версию `v1.0.136` и populated project view визуально стал значительно лучше, но review gates ещё не закрыты.

## Обязательные исправления

1. Exact Analytics -> Registry path:
   - При открытии `/app?surface=analytics` и клике `Реестр действий` default workspace view не должен терять registry table shell.
   - В empty state должны быть видны или явно сохранены table headers `Продукт / Действие / Процесс / шаг / Статус`, либо empty state должен быть оформлен так, чтобы runtime checklist не требовал отсутствующие headers.
   - AI controls должны быть видимы в допустимом workspace/project scope как disabled/empty-safe controls, если данных нет.

2. AI controls placement:
   - `AI: предложить действия` и `Выбрано для AI: N / 10` сейчас находятся в secondary sources/session block после таблицы и pagination.
   - Переместить или продублировать эти controls в primary filters/actions band рядом с filter/reset/export area.
   - Source/session block должен остаться вторичным.

3. Hygiene before merge/release:
   - Изолировать contour branch от unrelated dirty changes или явно доказать, что merge scope содержит только этот contour.

## Evidence

- Fresh runtime: `http://clearvestnic.ru:5180`, HTTP 200, no-cache headers.
- `build-info.json`: sha `5b20bc2`, contour id matches.
- Project context proof: `152` rows, filters work, pagination works, CSV/XLSX export works, console clean.
- Default exact path proof: workspace empty view shows `Показано 0-0 из 0`, no table headers, no AI controls.
- Source references:
  - `frontend/src/components/process/analysis/registry/ProductActionsRegistryTable.jsx:43`
  - `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:721`
  - `frontend/src/components/process/analysis/ProductActionsRegistryPanel.jsx:781`

## Required next review

After rework, Agent 4 should repeat browser runtime review on `:5180` for:

- `/app?surface=analytics` -> click `Реестр действий`.
- `/app?project=b1c8a56b6e&surface=analytics` -> click `Реестр действий`.
- `1280x800` responsive check.
- Console/network check with no registry errors and no unsafe durable mutations.

