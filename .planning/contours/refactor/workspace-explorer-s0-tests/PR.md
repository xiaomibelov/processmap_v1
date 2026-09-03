# PR: refactor/workspace-explorer-s0-tests — Шаг 0 страховочной сети

## Что

Реализация Шага 0 плана декомпозиции `WorkspaceExplorer.jsx` (DECOMP.md из #901): characterization-тесты C1–C4, ретаргет source-тестов, CI-гейт. **Product code не изменён** — diff по `frontend/src` содержит только тесты и тестовую инфраструктуру.

## 1. Characterization-тесты C1–C4 — 17/17 зелёные

`frontend/src/features/explorer/char/*.char.test.jsx` (vitest + jsdom + Testing Library; моки границ — исполняются реальные состояния/эффекты/обработчики компонента):

- **C1 (4):** сортировка дерева по кликам на шапку; чип-фильтр статусов (скрытие веток + force-expand совпадений); сброс фильтра на «Все» при скрытии активного статуса; сортировка сессий проекта + инлайн-фильтр `ProjectSessionsRows`.
- **C2 (5):** прецеденс explicit-over-prefs; lazy-load детей ровно один раз; bulk expand транзиентен (не пишет prefs); pref-restore one-shot на снапшот; изоляция дерева по контексту workspace.
- **C3 (4):** responsible без полного reload дерева; optimistic-патч трёх сторов + rollback обоих при ошибке; tree-session патч только кэшей; users-load при каждом открытии диалога.
- **C4 (4):** версионный статус-флоу (`apiGetSession` → `apiPatchSession` с `base_diagram_state_version`, порядок вызовов); dnd-upload (валидация→upload→инвалидация + reject-кейс); re-entrancy guard открытия сессии с `projectContext`.

## 2. CI-гейт: frontend-тесты исполняются на каждый PR

`.github/workflows/frontend-quality.yml` (раньше — только eslint no-undef, тесты на PR не исполнялись вообще):

1. `npm run test:char` — characterization (новый скрипт + `vitest.config.char.js`).
2. `npm run test:smoke` — существующий smoke-набор.
3. `node --test` explorer-scoped (`features/explorer` + `test-utils`) — 207/207 зелёные.

Любое падение = красный PR.

**Заодно исправлен pre-existing дефект инфраструктуры:** `npm test` был `node --test "src/**/*.test.mjs"` — node 20 не раскрывает glob в кавычках, весь node:test-набор **молча не запускался** (CI прогонял его «успешно» без единого теста). Стало `node --test $(find src -name '*.test.mjs' -type f)`.

## 3. Ретаргет 19 source-тестов

Все `*.source.test.mjs`, пинявшие текст `WorkspaceExplorer.jsx`, переведены на конкатенацию всех `features/explorer/*` (shared helper `src/test-utils/explorerSourceText.mjs`), срезы `between()` по умирающим якорям удалены, негативы — глобальные; пины на неподвижные файлы (`explorerApi.js`, `lib/api.js`, controller) сохранены. Behavioral-добавка: `explorerApi.test.mjs` (`apiGetProjectPage` tree-параметры). Детали и 3 осознанно ослабленных пина — в `TESTS.md` §4. Заодно починен pre-existing failure в `navZonePartA` (пин на умерший идентификатор).

## Побочные баги (зафиксированы, НЕ починены)

**char-bug-1 (OPEN)** — бесконечный passive-effect loop в `frontend/src/features/explorer/ExplorerSidebarContext.jsx`: `useSetExplorerSidebarHeader` зависит от JSX-идентичности `header`, provider value немемоизирован → render→register→setState→render→… Подробности и идея фикса — в `FOUND-BUGS.md`. В тестах обходится стабом контекста. Рекомендация: fix-контур **до Ш12/Ш17 DECOMP** (там регистрации sidebar переносятся).

## Осознанные решения (для review)

1. **Полный `node --test` suite не гейтится.** После починки glob-запуска выяснилось: 86 pre-existing failures вне explorer (technologist/process/analysis, appVersion v1.0.141) — идентичны до/после этого PR. Гейтить их = вечно красный main. Follow-up контур: починка/карантин 86 + расширение гейта на полный suite.
2. **E2E (playwright) не добавлен в гейт** — тяжёлый, требует стека; как и раньше, исполняется локально. Отдельное решение.
3. Пины на чистые функции, уже покрытые sibling-unit-тестами, удалены из source-тестов (покрытие не потеряно, задублировано).

## Проверка (docker node:20-alpine, воспроизводимо)

- `npm run test:char` → 17/17 passed, exit 0
- `npm run test:smoke` → 10 файлов / 30 tests passed
- `node --test $(find src/features/explorer src/test-utils -name '*.test.mjs')` → 207/207
- `npm run lint` → чисто
- `git diff origin/main --name-only -- frontend/src` → только `*.test.mjs`, `*.char.test.jsx`, `src/test-utils/`, `vitest.config.char.js` (+ `package.json`/lock: devDeps + 2 скрипта)

## Критерии приёмки

- [x] 16 characterization-тестов зелёные (17 с бонусным reject-кейсом), исполняются в CI на этом PR (job «Frontend Quality» → шаги test:char / test:smoke / Explorer node --test; ссылка на ран — в комментарии к PR после первого прогона)
- [x] Product-файлы не изменены
- [x] Найденные баги зафиксированы (FOUND-BUGS.md), не починены

Merge — только после явного approve.
