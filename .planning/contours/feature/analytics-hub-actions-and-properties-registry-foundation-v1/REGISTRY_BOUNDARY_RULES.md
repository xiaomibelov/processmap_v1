# Boundary rules: Analytics и реестры

Контур: `feature/analytics-hub-actions-and-properties-registry-foundation-v1`  
Run ID: `20260518T150609Z-73248`

## Analytics Hub

- Верхнеуровневая пользовательская поверхность.
- Отвечает за навигацию к analytic modules, а не за полную реализацию каждого module.
- Разрешенные entries в этом контуре: `Реестр действий`, `Реестр свойств`, `Дашборды`.
- Запрещено добавлять отдельный top-level `Экспорт`.

## Actions Registry inner page

- Внутренняя page: `Реестр действий с продуктом`.
- Durable source truth: `interview.analysis.product_actions[]`.
- Backend aggregation source: `Storage.list_product_action_registry_sources()` читает `interview_json` только для `analysis.product_actions[]`.
- Export CSV/XLSX остается здесь, потому что endpoint-ы экспортируют именно текущий registry query.
- Не является заменой Analytics Hub.

## Properties Registry foundation

- Внутренняя foundation/page: `Реестр свойств`.
- Допустимый текст: `Сводный список свойств BPMN-элементов и процессных объектов.`
- Можно показывать только read-only данные, источник которых подтвержден source/runtime evidence.
- Если unified property source не подтвержден, нужен structured placeholder без fake rows/counts.
- Нельзя смешивать с Product Actions Registry.

## Dashboard placeholder

- Entry виден внутри Analytics.
- Статус: future/placeholder.
- Нельзя показывать fake metric cards, fake charts, fake totals.

## Export

- Export не является top-level module в Analytics.
- Export живет внутри конкретного registry, где есть real data/query:
  - сейчас подтверждено для Product Actions Registry CSV/XLSX;
  - для Properties Registry export не подтвержден и не входит в этот контур.
