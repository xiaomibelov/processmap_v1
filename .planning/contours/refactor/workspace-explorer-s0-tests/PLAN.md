# PLAN: refactor/workspace-explorer-s0-tests — исполнение Шага 0

- Контур: `refactor/workspace-explorer-s0-tests`
- Ветка: `refactor/workspace-explorer-s0-tests` от `origin/main` @ `60bcd99b` (main после мержа #901)
- Основание: DECOMP.md (Шаг 0) и TESTS-BASELINE.md (план C1–C4) контура `audit/workspace-explorer-decomposition` (#901)
- Дата: 2026-09-04
- Product code: **не изменён** (проверено: `git diff` по `frontend/src` содержит только `*.test.mjs`, `*.char.test.jsx`, `src/test-utils/`, `vitest.config.char.js` + `package.json`/lock)

## Что реализовано из C1–C4

| Набор | Тест | Файл | Статус |
|---|---|---|---|
| C1 | сортировка дерева по имени (asc/desc по кликам на шапку) | `char/c1FiltersSort.char.test.jsx` | ✅ |
| C1 | чип-фильтр статусов: скрытие веток + force-expand совпадений при активном фильтре | `char/c1FiltersSort.char.test.jsx` | ✅ |
| C1 | скрытие активного статуса через «Настроить статусы» → сброс фильтра на «Все» | `char/c1FiltersSort.char.test.jsx` | ✅ |
| C1 | сортировка сессий проекта + инлайн-фильтр статусов в дереве (характеризована инлайн-реализация ProjectSessionsRows) | `char/c1FiltersSort.char.test.jsx` | ✅ |
| C2 | explicit toggle переопределяет persisted prefs (прецеденс prefs → explicit) | `char/c2TreeExpansion.char.test.jsx` | ✅ |
| C2 | lazy-load детей папки ровно один раз при быстрых кликах (inFlight-дедуп) | `char/c2TreeExpansion.char.test.jsx` | ✅ |
| C2 | bulk expand транзиентен: не пишет prefs | `char/c2TreeExpansion.char.test.jsx` | ✅ |
| C2 | pref-restore грузит детей ровно один раз на снапшот prefs | `char/c2TreeExpansion.char.test.jsx` | ✅ |
| C2 | изоляция дерева по контексту `workspaceId::folderId` | `char/c2TreeExpansion.char.test.jsx` | ✅ |
| C3 | responsible assignee раздела: `apiUpdateFolder({responsible_user_id})` без полного reload дерева | `char/c3Assignees.char.test.jsx` | ✅ |
| C3 | session assignees (ProjectPane): optimistic-патч трёх сторов + rollback обоих при ошибке | `char/c3Assignees.char.test.jsx` | ✅ |
| C3 | session assignees (дерево): патч только кэшей, без рефетча страницы | `char/c3Assignees.char.test.jsx` | ✅ |
| C3 | assignable users грузятся при каждом открытии диалога (дубль эффектов 2918/4358 зафиксирован как есть) | `char/c3Assignees.char.test.jsx` | ✅ |
| C4 | версионный статус-флоу: `apiGetSession` → `apiPatchSession` с `base_diagram_state_version`, порядок вызовов | `char/c4StatusUploadOpen.char.test.jsx` | ✅ |
| C4 | dnd bpmn на строку проекта: валидация → `createSessionWithBpmnUpload` → инвалидация (+ бонус: reject невалидного файла) | `char/c4StatusUploadOpen.char.test.jsx` | ✅ |
| C4 | открытие сессии: re-entrancy guard, ровно один вызов `onOpenSession` с `projectContext` | `char/c4StatusUploadOpen.char.test.jsx` | ✅ |

Итого: **16 обязательных + 1 бонусный (reject-drop) = 17 тестов, все зелёные** (`npm run test:char`, docker node:20-alpine, exit 0).

## Что ещё входило в контур

1. **Инфраструктура characterization-тестов:** `vitest.config.char.js`, `src/test-utils/charSetup.js` (jsdom-стабы), `src/test-utils/explorerChar.jsx` (параметризуемые моки контроллера/api/query-модулей — паттерн smoke-теста, обобщённый), devDeps `@testing-library/*`, скрипт `npm run test:char`.
2. **Фикс `npm test`:** было `node --test "src/**/*.test.mjs"` — на node 20 кавычки не раскрываются, suite **молча не запускался вообще** (`Could not find '/app/src/**/*.test.mjs'`). Стало `node --test $(find src -name '*.test.mjs' -type f)`.
3. **Ретаргет 19 source-тестов** (см. TESTS.md): с пинания текста `WorkspaceExplorer.jsx` на конкатенацию всех `features/explorer/*` + behavioral-добавки.
4. **CI-гейт** в `frontend-quality.yml`: `test:char`, `test:smoke`, explorer-scoped `node --test`. Полный `node --test` suite НЕ гейтится — 86 pre-existing failures вне explorer (см. PR.md «Осознанные решения»).

## Побочные баги (не чинили, зафиксировали)

См. `FOUND-BUGS.md`: **char-bug-1 (OPEN)** — бесконечный passive-effect loop в `ExplorerSidebarContext.jsx` (`useSetExplorerSidebarHeader`: deps от JSX-идентичности + немемоизированный provider value). Обход в тестах: стаб контекста. Кандидат в отдельный fix-контур до Ш12 DECOMP (перенос регистраций sidebar).

## Отклонения от плана

- C1#4: чипы статусов рендерятся в toolbar-сibling таблицы (не внутри `explorer-table-container`) — селекторы адаптированы, поведение зафиксировано как в коде.
- C2#3: bulk-toggle disabled до загрузки root-страницы — тест ждёт появления строк перед кликом.
- C3#3: диалог «Исполнители схемы» — checkbox-мультиселект (не radio).
- Ретаргет: 3 пина ослаблены по механизму с сохранением intent (документировано в TESTS.md §4).
