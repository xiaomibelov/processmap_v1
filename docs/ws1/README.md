# WS1 — Рабочее место TO BE на канвасе

- **Дата:** 2026-07-30
- **Маршрут:** `/technologist/workspace` (TopBar «Технолог» и «Мои процессы» ведут туда; старые маршруты работают)
- **Скринкаст:** `ws1_walkthrough.webm` (stage, technologist-demo, EXIT=0) + 11 скринов + `ws1_soups.bpmn`

## Критерии приёмки

| # | Критерий | Доказательство | Статус |
|---|---|---|---|
| 1 | Весь воркфлоу на одной странице | `ws1_walkthrough.webm`: импорт → трансформация → конструирование → рецепт → проверка → публикация (шаблон 200, рецепт 200) → пилот — без смены маршрута | ✅ |
| 2 | Панель: drag/dock/persist, двусторонняя синхронизация | `09_panel_float.png` (float, dragged), `10_panel_dock.png`, persist `{"mode":"float","x":420,"y":240}`; клик по блоку → BlockForm в панели; клик finding → подсветка на канвасе; vitest `WorkspacePanel.test.mjs` 3/3 | ✅ |
| 3 | AS IS слоем + решения трансформации на схеме | `02_import_as_is_layer.png` (split AS IS/TO BE), `03_transform_decisions.png` (бейджи ✓ на блоках + решения в панели), `04_decision_rejected.png` (✗) | ✅ |
| 4 | Ввод в панели → мгновенно на канвасе | редактирование params в BlockForm → перерендер GraphCanvas (markDirty → setUiModel); скринкаст | ✅ |
| 5 | Выход — XML, E7-генератор не тронут | публикация из рабочего места, «Скачать BPMN» → `ws1_soups.bpmn` (валиден, 18 tasks); round-trip тесты зелёные (93 passed) | ✅ |
| 6 | Регрессия контуров E3–E9 | backend **93 passed**, vitest **48/48** (9 файлов, вкл. новый тест панели) | ✅ |
| 7 | i18n и RBAC | UI на русском (словарь `ws.*`); скринкаст под technologist-demo (без admin-прав) | ✅ |

## Архитектура

- `workspace/Workspace.jsx` — оркестрация: модель TO BE + слой AS IS + тулбар воркфлоу (действие по шагу) + связи/палитра.
- `workspace/WorkspacePanel.jsx` — dock/float панель (drag за заголовок, persist в localStorage `fpc_ws1_panel`).
- `workspace/RecipePanel.jsx` — форма рецепта (coercion типов, автовыбор при ремаунте).
- `workspace/PilotPanel.jsx` — создание пилота 1 клик (lazy-fetch рецептов/кухонь) + PilotCard + rollout.
- Переиспользование: `GraphCanvas` (+аддитивный prop `nodeBadges`), `constructor/panels.jsx` (BlockForm/FlowForm/EntitiesPanel/TemplatePanel — вынесены рефактором `9e5ca1fd`), `CheckPanel`, `AuditHistory`, `WorkflowBar`.
- Слои: `tobe | asis | split` (split — две канвасы рядом, AS IS приглушён read-only).

## Отклонения ⚠️

- ⚠️ Совмещение слоёв — режим split (две канвасы) + переключение, НЕ наложение одной SVG на другую (z-order/выделение — риск из брифа). Истинный overlay — отдельная задача, если потребуется.
- ⚠️ Критерии пилота — дефолтные 20/0/2% (как в UX1); редактирование критериев из панели — v1.
- ⚠️ Форма BlockForm не сбрасывает внутренний state при смене узла без перемонтирования (обходится переключением вкладки; известный нюанс React-формы E4, в backlog).
- ⚠️ Тесты E2.0b/recipes/sku_bindings обновлены ранее осознанно (контракт роли technologist из UX1); маршруты не менялись — обновлений маршрутов нет.

## Регрессия
`scripts/regression_e1_e4.sh` — **к запуску владельцем** (внутри эпика не запускалась).
