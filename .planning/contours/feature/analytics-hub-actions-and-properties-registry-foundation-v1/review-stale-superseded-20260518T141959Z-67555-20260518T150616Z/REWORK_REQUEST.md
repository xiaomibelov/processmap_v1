# REWORK_REQUEST

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T141959Z-67555`  
Дата: `2026-05-18T14:45:45Z`

## Verdict

CHANGES_REQUESTED.

## Обязательное исправление

`Реестр действий` в served runtime не выполняет visual gate из reviewer prompt:

```text
one white content container
```

Фактическое browser evidence:

```text
product-actions-registry-panel background: rgb(23, 31, 54)
body background: rgb(11, 16, 30)
```

Нужно привести inner page `Реестр действий с продуктом` к одному белому content container без возврата визуального шума.

## Сохранить без регрессий

- `Аналитика` остаётся top-level surface.
- В Analytics остаются только module entries:
  - `Реестр действий`;
  - `Реестр свойств`;
  - `Дашборды`.
- Не добавлять отдельный top-level module/card `Экспорт`.
- CSV/XLSX остаются в header `Реестр действий`.
- AI controls остаются в primary area registry page.
- Table/role-table structure остаётся primary.
- `Вернуться` возвращает в Analytics.
- `Реестр свойств` остаётся honest foundation без fake rows/counts.
- `Дашборды` остаётся future placeholder.
- Не менять backend/schema/BPMN/RAG runtime.

## Re-validation после rework

Повторить:

```text
curl -I http://clearvestnic.ru:5180
curl -s http://clearvestnic.ru:8088/health
curl -s http://clearvestnic.ru:5180/build-info.json
node --test src/app/processMapRouteModel.test.mjs src/components/process/analysis/ProductActionsRegistryPage.test.mjs src/components/process/analysis/ProductActionsRegistryPanel.test.mjs src/features/navigation/appLinkBehavior.test.mjs
git diff --check
```

И обязательный browser proof:

- fresh authenticated runtime on `http://clearvestnic.ru:5180`;
- open Analytics;
- open `Реестр действий`;
- verify one white content container;
- verify no gradients/dotted borders/colored metric cards/internal shadows;
- verify no console errors and no unsafe `PUT/PATCH/DELETE`.
