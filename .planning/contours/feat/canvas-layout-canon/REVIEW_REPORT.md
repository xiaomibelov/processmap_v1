# REVIEW_REPORT — feat/canvas-layout-canon

Дата: 2026-09-24. Reviewer: parent agent (ручной diff-review всех трёх задач + baseline-прогоны).

## Вердикт: APPROVE (с замечаниями ниже)

## Задача 1 — канонический align (c176eb4d)

Проверено: diff модуля `canonLayout.js`, wiring в `BpmnStage.jsx`, тесты.
- DFS-порядок с тай-брейком (x,y) детерминирован; back-edge не двигает ноды — корректно.
- Канон размеров через суффиксы типов (`/Task$/`, `/Event$/`, `/Gateway$/`) покрывает UserTask/ServiceTask/StartEvent/EndEvent/ExclusiveGateway и т.п.
- Применение через `modeling.moveElements`/`resizeShape`/`updateWaypoints`/`layoutConnection` — тот же слой, что и раньше; ops-outbox/autosave сохраняются автоматически.
- Регрессионный acceptance-тест точен (GAP, Y0, канон, кратность 10, лейн петли Y0+200, +80 за параллель).
- Не делает: диаграммы без стартовых событий кладутся на ось целиком (хвост по (x,y)) — осознанное решение, задокументировано.

## Задача 2 — offset-модель шаблонов (c5151863)

Проверено: diff `templatePackAdapter.js`, `applyBpmnFragmentTemplatePlacement.js`, тесты.
- Capture пишет offsets от entry-якоря (fallback top-left) + маркер `offset.v1` — оба пути capture (обычный, subprocess-subtree).
- Lazy-миграция идемпотентна по маркеру; читает обе модели (`readNodeBounds` offset-приоритет); bbox стабилен (w/h не меняются).
- Pack-path вставки: точные offsets без min-нормализации — сохраняет относительную геометрию; legacy-паки без миграции имеют прежний fallback (обратная совместимость прямых вызовов).
- Backend не тронут (payload opaque), openapi не затронут — согласно §6.1 контракта не требуется.
- Тесты: +12 новых, ни один существующий не ломался (111/111 в suite).

## Задача 3 — чипы свойств (a5c5fb5b)

Проверено: diff `overlayLayoutModel.js`, `decorManager.js`, CSS, тесты.
- Above: bottom = nodeTop − 20 (topOffset −20 + translate(-50%,-100%)), центр по anchorLeft, width = width ноды (floor 76), ellipsis сохранён.
- Below: top = nodeBottom + 20, класс-модификатор, dataset.placement; правило `y < 40` детерминировано; placement в signature — overlay пересоздаётся при смене.
- V2: контракт центрирования/зазора закреплён тестом чтения CSS (прецедент в кодовой базе).
- 6 фейлов `decorManager.user-notes-docs-badge.test.mjs` — НЕ регрессия: доказано прогоном на чистом baseline origin/main (`git worktree` `.tmp-canon-base` + тот же node_modules): те же 2 pass / 6 fail. Причина — jsdom-окружение (бейдж не эмитится), к контуру отношения не имеет.

## Полный прогон

- `npm test` (frontend, node --test все .test.mjs): **контур 4246 тестов / 4166 pass / 76 fail; baseline origin/main 4220 / 4140 / 76 fail** (git worktree `.tmp-canon-base` + тот же node_modules). Списки уникальных фейлов идентичны (73 наименования) — **ноль регрессий**, все 76 пре-существующие (в т.ч. pin `dark-theme-contrast` на v1.0.141 против фактической v1.0.151 и jsdom docs-badge).
- appVersion bumped до v1.0.152 по конвенции changelog (1-3 русские строки). Тестовых пинов на v1.0.151 нет.

## Замечания (не блокеры)

1. `viewportTopLimit`/`preferBelow` реализованы в геометрии, но decorManager не передаёт реальную границу viewport — правило `y < 40` покрывает типовой случай.
2. RAG-инфраструктура workspace degraded (reindex OOM 137, поиск молчит) — вне контура, зафиксировано в EXEC_REPORT.
3. Рекомендуется manual QA на живом канвасе: кнопка «Выровнять схему» на схеме с петлёй «no» и вставка шаблона со свимлейнами/кругом (acceptance-критерии постановки).
