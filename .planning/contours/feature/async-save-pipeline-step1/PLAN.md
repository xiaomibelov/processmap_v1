# PLAN — feature/async-save-pipeline-step1

> Контур: инкрементальное (дельта) сохранение диаграммы.
> Статус: PLAN, ожидает approve пользователя. Код не пишется до approve.
> Дата: 2026-09-14. Baseline: `origin/main` @ `b8285741`.

## 1. Runtime/source truth (зафиксировано)

- Workspace: `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/feature-async-save-pipeline-step1` (worktree от `p0-work`).
- Branch: `feature/async-save-pipeline-step1`, создана от `origin/main` = `b8285741`.
- Remote: `origin git@github.com:xiaomibelov/processmap_v1.git`.
- `git status`: clean на момент старта.
- Primary save сегодня: `PUT /api/sessions/{id}/bpmn` (полный XML, CAS по `diagram_state_version`), фронт — `frontend/src/features/process/bpmn/save/` + `features/session/saveCoordinator.js` (pipelines `xml` / `rawXml` / `meta`).

## 2. Проблема

Save-pipeline синхронный: фронт сериализует полный BPMN XML (~745 kB на схемах 300+ элементов) и ждёт ответа бэка. Network-профиль: ~745 kB / ~2 s на запрос, под нагрузкой до 9–10 s (audit/canvas-save-lag, audit/save-loop-version-flicker-v1). UI-компенсации (debounce 10 s, drag-throttle, skip-if-unchanged) уменьшают частоту, но не размер и не блокирующий характер запроса. Сессии 300+ элементов почти готовы к быстрому рендеру — save остался последним блокирующим участком.

## 3. Решение по формату дельт (выбор и обоснование)

**Выбрано: сериализованные команды в bounded op-vocabulary, производные от commandStack.**
**Отвергнуто: JSON Patch (RFC 6902) над диаграммной моделью.**

Обоснование:

1. **На сервере нет канонической JSON-модели диаграммы.** `sessions.bpmn_xml` — opaque TEXT (`backend/app/domains/storage/compat/repository.py:886-934`). JSON Patch требовал бы на сервере: parse XML → построить каноническую JSON-модель → apply patch → сериализовать обратно. Round-trip XML→JSON→XML небезопасен: порядок элементов DI, форматирование, camunda-расширения, namespace-префиксы — всё это источник byte-drift.
2. **Весь downstream работает с XML-текстом.** Subprocess re-embed — строковая хирургия (`app/services/bpmn_navigation.py`), parse-once derivatives кэшируются по `sha1(xml)` (`app/services/bpmn_xml_derivatives.py`), `bpmn_versions` хранит снапшоты XML. Дельта-протокол обязан сохранять XML source of truth — иначе ломаем parent re-embed и snapshot-цепочку.
3. **Сырой dump commandStack несериализуем** — `context` команд содержит element refs, closures, business objects. Нужна явная сериализация в небольшой vocabulary.
4. **Bounded vocabulary = bounded server-side applier.** Клиент преобразует только whitelisted команды; всё остальное уходит в существующий full-save путь (fallback, см. §7). Сервер применяет ops к ElementTree в одной транзакции — применение проверяемо и тестируемо оп из опа.
5. **Prior art на клиенте:** `frontend/src/features/process/bpmn/ops/` (`applyOps.js`, `parseOps.js`) уже содержит op-vocabulary и аппликатор op-листов к live modeler (AI edit plans). Step1 выравнивает серверный vocabulary с существующим клиентским и расширяет его направлением modeler→server. Одна реализация, два направления (правило единой реализации, AGENTS.md §2 skill processmap-agents п.10).

## 4. Scope step1

**В контуре:**
- `POST /api/sessions/{id}/operations` — батч ops с `baseVersion`, атомарное применение, инкремент версии на батч, идемпотентность по `opId`, 409 с `currentVersion` + `currentXml`.
- Фронт `SaveOutbox`: подписка на `commandStack.changed`, накопление whitelisted ops, debounce 2.5 s / порог 50 ops, flush на `visibilitychange=hidden` и `beforeunload`, optimistic-индикатор, rebase при 409.
- Fallback: полный save (существующий pipeline) не удаляется и не меняется по поведению; используется для не-whitelisted команд и при ошибке дельта-протокола.
- Тесты: unit (outbox), api (happy/409/идемпотентность/транзакционность), e2e (300+ элементов, 20 правок).
- Регенерация `docs/openapi.yaml` (blocking rule AGENTS.md §6.1).

**Вне контура:** удаление/deprecation full-save, undo/redo-native rebase (ниже), spaceTool-оптимизации, cross-tab conflict UX (существующий модал не трогаем), prod-деплой.

## 5. Протокол (кратко, подробности в API.md)

```
POST /api/sessions/{id}/operations
body: { baseVersion: int, operations: [{ opId: uuid, type, ...payload }] }
200: { version: int, applied: n, skipped: n }   # version = новый diagram_state_version
409: { code: "DIAGRAM_STATE_CONFLICT", currentVersion, currentXml }
```

- CAS: `baseVersion` против текущего `diagram_state_version`; reuse существующих примитивов (`_require_diagram_cas_or_409`, `storage.save(..., expected_diagram_state_version=...)`, Redis lock `acquire_session_lock`).
- Версия инкрементится **на батч** (не на op) — семантика версий не меняется.
- Идемпотентность: таблица `session_applied_ops (session_id, op_id, applied_version, applied_at)` с unique `(session_id, op_id)`; вставка в той же транзакции, что и apply. Повтор батча → все opId уже есть → 200 `{version: current}` без инкремента.
- Неизвестный/невалидный op в батче → весь батч откатывается (атомарность), 422 `OPERATION_UNSUPPORTED` с указанием opId; клиент переводит сессию на full-save fallback.

## 6. Фронт (кратко, подробности в UI.md)

- **SaveOutbox** — четвёртый pipeline в существующем `saveCoordinator` (`features/session/saveCoordinator.js`), не отдельная очередь: получаем debounce, retry/backoff, AbortController, conflict gate, status events бесплатно. Mutual exclusion с pipelines `xml`/`rawXml`/`meta` — один writer на сессию (решение #924 save-single-writer сохраняется).
- Источник ops: существующая подписка `commandStack.changed` (`createBpmnRuntime.js:201`) → маппер command→op (whitelisted: `element.updateProperties`, `shape.move`, `shape.resize`, `shape.create`, `shape.delete`, `connection.create`, `connection.delete`).
- Flush: debounce 2.5 s; порог 50 ops; `visibilitychange→hidden` и `beforeunload/pagehide` — немедленно.
- **beforeunload: `fetch(..., {keepalive: true})`, не `sendBeacon`** — sendBeacon не умеет `Authorization` header, а backend требует JWT bearer. `keepalive` сохраняет заголовки и работает во время unload. Это осознанное отступление от формулировки миссии («sendBeacon») с обоснованием; эффект тот же (best-effort доставка при уходе).
- CAS: единый источник истины — `casVersionTracker` + `casResponse.js` (resolve base at send time, bump on success, rollback only if self-bumped) — тот же контракт, что у pipelines `xml`/`meta`.
- Индикатор: расширение `DiagramToolbarSaveStatusSlot` состояниями outbox (сохраняется/сохранено/конфликт-rebase) через существующий `useSaveUploadLifecycle` + debounced emit.
- **Optimistic UI:** правка подтверждается локально мгновенно (уже так — commandStack применяет синхронно); outbox лишь меняет индикатор.

### Rebase при 409

1. Outbox переходит в `rebasing`, новые ops продолжают копиться в staging-буфер.
2. Клиент принимает `{currentVersion, currentXml}`: version tracker adopt server version (cross-tab publish через `crossTabVersionSync` сохраняется).
3. Неотправленные + неподтверждённые ops replay'ятся на `currentXml` через существующий клиентский аппликатор `bpmn/ops/applyOps.js` (proven-путь AI edit plans, fuzzy resolution по id/name), затем обычный flush.
4. Undo/redo-native rebase (undo local stack → adopt server → redo) — **исследование в рамках step1**, не блокер: replay через applyOps — primary-механизм, т.к. инфраструктура уже существует и покрыта тестами. Если в ходе реализации выяснится, что replay ломает DI/waypoints, вернёмся к плану с решением.
5. Cross-tab конфликт (другая вкладка пишет): существующий conflict gate + модал `ProcessStageSaveConflictModal` не трогаем — outbox rebase работает только для same-tab race (наш 409 от собственного устаревшего base).

## 7. Fallback policy

- Команда вне whitelist → текущий flush full-save (pipeline `rawXml`), outbox сбрасывается (server state после full save покрывает все применённые локально ops).
- Full save (manual Ctrl+S, before-switch flush) → outbox очищается по ack.
- Ответ 422 `OPERATION_UNSUPPORTED` / двойной 409 подряд / transport error после retry → сессия переводится в `ops-degraded`: до перезагрузки страницы сохранение идёт full-save путём, индикатор показывает degraded. Не авто-reload без approve пользователя.
- Экспорт / XML-вкладка — по-прежнему полный XML (критерий приёмки).

## 8. Ограничения и риски

1. **Server-side XML re-serialize.** Применение ops к ElementTree пересериализует документ — при нормальной записи XML сохраняет семантику, но byte-формат может отличаться (self-closing tags, кавычки). Митигация: тест parity «apply ops == load+edit+saveXML» на golden-файлах; форматирование `format=false` при re-serialize; subprocess re-embed переприменяется к результату (существующий шаг save-пайплайна).
2. **Parse cost на батч.** ~58 ms CPU на полный parse (`bpmn_xml_derivatives`), кэш по sha1 не поможет (новый XML каждый батч). Бюджет e2e: ответ <300 ms — parse укладывается; пересчёт derivatives один раз на батч.
3. **DI/waypoints drift.** Move/resize-опы должны обновлять DI (bpmndi) синхронно с семантикой. Митигация: серверный applier покрывается golden-тестами на реальных 300+ элементных схемах; ops, которые не удалось применить чисто, → 422 → fallback.
4. **Property-op ordering.** Существующие property-* действия намеренно bypass coalescing (non-commutative, #924) — они остаются на pipeline `meta`/full-save, в outbox не попадают.
5. **Параллелизм ops vs full save.** Решается mutual exclusion в saveCoordinator (один writer на сессию).
6. **FPC_E2E_CAS_BYPASS** и `request=None` harness-bypass учтены в дизайне handler-signature и тестах (как в существующих CAS-тестах).

## 9. Критерии приёмки

1. Схема 300+ элементов: серия из 20 правок подряд — UI не фризится (нет longtask >200 ms на правку, измеряется e2e).
2. В Network за серию правок — только `POST /operations` с телом ≤10 kB; полный XML уходит только при экспорте/XML-вкладке и явном fallback.
3. Ответ `operations` <300 ms p95 на dev-стеке.
4. 409-rebase: same-tab race разрешается автоматически без модала, без потери правок.
5. Идемпотентность: повторная доставка батча (retry) не создаёт второй инкремент версии.
6. Full-save endpoint и его e2e-контракты (canvas-editing-stability и др.) — зелёные, неизменённые по поведению.

## 10. Open questions (решаются в ходе реализации, не блокируют approve)

- Точный маппинг command→op для drag-последовательностей (много move-команд → coalesce в последний bounds на клиенте до сериализации).
- Размещение серверного applier: новый `backend/app/save_services/ops_applier.py` vs расширение `sessions_core.py`. Склоняемся к отдельному модулю + тонкий route-handler в `_legacy_main.py` (единый стиль с save-services планом save-decomposition-v1).
- Undo/redo-native rebase (см. §6.4).

## 11. Артефакты контура

- `PLAN.md` (этот файл), `API.md`, `UI.md`, `TESTS.md`, `PR.md` (черновик), `STATE.json`.
- После approve: код по `TESTS.md` (TDD: RED → GREEN → REFACTOR), `EXEC_REPORT.md`, review, PR. Merge/deploy — только после явного approve.
