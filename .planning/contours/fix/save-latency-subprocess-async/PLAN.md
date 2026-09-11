# PLAN — fix/save-latency-subprocess-async (v2, расширен)

**Контур:** fix/save-latency-subprocess-async
**Ветка:** `fix/save-latency-subprocess-async`
**Base:** `origin/main` (`2f1f6444`)
**Дата:** 2026-09-12 (v2 — после аудита логики L1–L13 и сверки с PR #963)
**Источник:** audit/safe-pipeline-audit-v1: **F1 (HIGH)** + аддендум логических ошибок **L1, L2, L3, L4, L5, L10**
**Статус:** ⏳ ждёт approve PLAN.md. Код не начинаем до approve.

---

## 0. Синхронизация с PR #963 (fix/api-polling-reduction)

Проверено по коду ветки #963 — **не дублируем**:

| Тема | Статус в #963 |
|---|---|
| F5/L7 моно-очередь | ✅ Закрыто: `queueKey = ${pipelineName}::${sid}` (per-pipeline lanes). Попутно закрыт дедлок вложенного `execute("rawXml")` внутри xml-транспорта — причина «свойство висит 10 с и исчезает». |
| Stop-gap таймаута | ✅ Закрыто: `xmlPipeline.transportTimeoutMs` 10 000 → 60 000 (abort как страховка). Шаг Ф2 из v1 плана **отменён**. |
| Фоновый API-поллинг | ✅ Закрыто (вне нашего скоупа). |

**НЕ закрыто в #963 (наш скоуп ниже):** L1 (rollback логика не изменена, код ветки идентичен main), L2, L3, L10, L4, L5, F1, F2. Ложный комментарий `// Abort the real fetch so the server never receives the request` в `_runTransportWithTimeout` в #963 сохранён — удаляем мы (Ф2).

**Пересечение файлов:** `saveCoordinator.js`, `autosaveConfig.js` трогают оба PR. Порядок: сначала merge #963 → rebase этой ветки (наши правки — другие функции, конфликт минимален). Обратный порядок допустим, но тогда #963 ребейзится на нас.

## 1. Цель

1. `PUT /api/sessions/{id}/bpmn` отвечает сразу после CAS-commit ядра (F1): subprocess-sync уходит из request-path автосейва.
2. **Ни один физически успешный коммит не превращается на клиенте в ошибку или self-409** (L1, L2).
3. **Ни один фоновый/сайдбар-писатель не затирает чужой коммит молча** (L4, L5).
4. Conflict gate не загоняет пользователя в цикл 409 (L3).

**Acceptance (замеряемо):**
- Схема 250+ элементов / 30+ подпроцессов: p95 `PUT /bpmn` (canvas) < 2 s, 0 видимых 409, 0 конфликт-модалок.
- Timeout/network-error при успешном серверном коммите → save завершается успехом через reconcile; tracked-base не сдвигается назад ни при одном failure (unit-доказательство L1).
- Сценарий «пользователь печатает в интервью-сайдбаре во время замедленного PUT /bpmn» → 0×409, ответ не теряется.
- Конкурентные `POST /recompute` / `POST /answer` + `PUT /bpmn` → `bpmn_xml` не откатывается (lost-update тест), гонка answer честно даёт 409 вместо молчаливой перезаписи.
- «Отмена» в конфликт-модале не порождает повторный 409-цикл.

## 2. Root causes

**F1 (из аудита, без изменений):** `session_service.bpmn_save` синхронно материализует подпроцессы (рекурсия ≤ 8, per-element DB-записи) → секунды latency на каждый canvas-save.

**L1 (HIGH, frontend):** `rollbackTrackedDiagramStateVersion` вызывается в ветках 409/timeout/error, но `bump` происходит только в `completeSuccess` — rollback съедает последнюю **успешную** версию из history (`[7,8] → [7]`) → следующий save = гарантированный self-409 → gate → заморозка. Один сетевой сбой без всякого коммита порождает настоящий 409.

**L2 (HIGH, frontend):** timeout/abort трактуется как «запись не прошла», хотя сервер коммитит; `reconcileConflict` подключён только к 409, на timeout reconcile нет.

**L3 (MED, frontend):** `resolveConflict("cancel")` снимает gate, но не восстанавливает base (после L1 он откатан) → следующий save снова 409 → модалка по кругу.

**L4 (HIGH, backend):** `session_service.recompute_session` — `load → _recompute_session → st.save(sess)` полной строкой **без CAS и без dsv-bump**. Вызывается фронтом после каждого интервью-автосейва (120 мс) → постоянный поток full-row перезаписей, гонка с PUT /bpmn → молчаливый lost update XML. Плюс mermaid ×2 + analytics + полный `model_dump()` в ответ на каждый вызов — торможение сайдбара.

**L5 (HIGH, backend):** `session_answers.answer()` — CAS-проверка (`_require_diagram_cas_or_409`), затем `_recompute_session` (окно гонки), затем `st.save(s)` полной строкой **без SQL-гварда**: check-then-act, проверка не защищает запись (TOCTOU).

**L10 (LOW, frontend):** `casVersionTracker.rollbackVersion` не вызывает `notifyVersionListeners` → после отката вторая вкладка живёт с более новой версией → межвкладочный рассинхрон base.

## 3. Non-goals (вне контура)

- **F2** (post-CAS запись `bpmn_meta.subprocesses_*` без CAS) — отдельный контур `fix/save-post-cas-write`. Здесь не усугубляем (Б1: celery-задача НЕ пишет в сессионную строку).
- **F3** (423 retry-бюджет < TTL лока), **F4** (self-heal conflict gate по `client_id`) — отдельные контуры.
- **L6** (CAS-дисциплина для child-sync записей подпроцессов) — часть F2-контура.
- L7/L11–L13: L7 закрыт #963; L11/L12/L13 — low, фиксим попутно только если файл и так тронут.
- Редизайн conflict UI, рефакторинг `_legacy_main`.
- Merge/deploy — только после approve.

## 4. Дизайн-решения (обсуждаются на approve)

### 4.1. F1: два класса `PUT /bpmn` по `source_action` (без изменений от v1)

| Класс | source_action | Sync-блок |
|---|---|---|
| Явный импорт | `bpmn_upload`, `import`, `bpmn_restore` | **Синхронно** (счётчики в ответе сохраняются). |
| Canvas-сохранения | `autosave`, `manual`, `flush_save*`, `property_*`, прочие | **Асинхронно**: ответ после CAS-commit + celery-задача. |

### 4.2. L4/L5: дисциплина записи для не-CAS писателей (минимально инвазивно)

| Писатель | Сейчас | Становится |
|---|---|---|
| `recompute_session` | full-row `st.save` без CAS | **Field-scoped UPDATE** только derived-полей (`normalized`, `resources`, `questions`, `mermaid*`, `analytics`, `version`); `bpmn_xml` и `diagram_state_version` в UPDATE не входят → lost update XML исключён конструктивно, 409 на фоновой операции не появляется. |
| `answer()` | check → recompute → full-row `st.save` | check → recompute → **`_save_session_with_cas`** (тот же base, что прошёл проверку). Гонка → честный 409 (фронт обрабатывает gate'ом) вместо молчаливой перезаписи. |

### 4.3. L3: семантика resolveConflict

- `refresh` → данные перечитываются + `setTrackedDiagramStateVersion(serverVersion)` (сейчас adopt только у `overwrite`).
- `overwrite` → как сейчас.
- `cancel` → **конфликт НЕ удаляется**, модалка скрывается до следующего save; gate продолжает блокировать. Цикл 409 исключён, потому что base не испорчен (Ф1/L1) и следующий save не уходит в транспорт.

## 5. План работ

### Frontend

- **Ф1 (L1).** Rollback-дисциплина в `saveCoordinator._runPipeline`: `rollbackTrackedDiagramStateVersion` вызывается только если в ЭТОМ прогоне был bump (флаг `bumpedInRun`); на timeout/error/409 history трекера не трогается. На 409 rollback убирается вовсе (base обновляется только через `resolveConflict`).
- **Ф2 (L2).** `reconcileTimeout`: на transport-timeout И на status-0 network error — до объявления failure — один `GET /api/sessions/{id}/meta`: dsv вырос + `current_session_payload_hash` совпал с хэшем отправленного payload ⇒ УСПЕХ (adopt dsv, `pipeline_success`); иначе — прежний failure-path (без rollback, см. Ф1). Хук `reconcileTimeout` в конфиге pipeline, реализация в xml-pipeline. Ложный комментарий в `_runTransportWithTimeout` заменить фактическим («abort прекращает ожидание ответа; сервер мог уже закоммитить — см. reconcile»).
- **Ф3 (L3).** `resolveConflict` по §4.3.
- **Ф4 (L10).** `rollbackVersion` → `notifyVersionListeners("rollback", …)` (для оставшихся валидных путей отката), cross-tab не расходится.
- **Ф5.** Индикатор `subprocesses_sync: "pending"` в save-статусе (из v1, без изменений).

### Backend

- **Б1–Б4 (F1)** — без изменений от v1: celery-задача `sync_subprocesses_task` (lock TTL 120 s, идемпотентная, НЕ пишет сессионную строку), dispatch по §4.1, счётчики для async-пути — read-model при чтении, feature-flag `FPC_ASYNC_SUBPROCESS_SYNC` (default 0 → stage-замер → default 1).
- **Б5 (L4).** `recompute_session` → field-scoped UPDATE derived-полей по §4.2 (новый метод в `session_repo`/storage, без full-row save).
- **Б6 (L5).** `answer()` → `_save_session_with_cas` по §4.2. Контракт `{"error": "question not found"}` (HTTP 200) не ломаем в этом контуре.

### Tests

- **Frontend unit (RED→GREEN):**
  - L1: error/timeout/409 после ≥1 успешного save НЕ меняют tracked base; успешный save после сбоя проходит без 409;
  - L2: timeout + reconcile-совпадение → success + adopt; расхождение → failure; meta недоступен → failure без цикла;
  - L3: cancel → gate сохранён, повторного 409 в транспорт нет; refresh → adopt serverVersion;
  - L10: rollback → listener уведомлён.
- **Backend unit:**
  - Б5: recompute не пишет `bpmn_xml`/`diagram_state_version` (набор полей UPDATE зафиксирован в тесте); concurrency-тест: recompute во время PUT → XML не откатывается;
  - Б6: answer с протухшим base → 409 (а не молчаливая запись); answer + параллельный PUT → либо успех по CAS, либо 409, lost update невозможен;
  - Б1–Б4: как в v1 (mock celery, lock-busy retry, идемпотентность, гард против записи dsv, флаг off = побайтовый паритет).
- **E2E (canvas-editing-stability.spec.mjs):**
  - замедленный `PUT /bpmn` (route interception) + ввод в интервью-сайдбаре → 0×409, ответ не потерян;
  - схема 250+/30+: серия правок → 0×409, 0 модалок; замеры в лог.
- **Регрессии:** дельта падений против main = 0 (учесть 84 pre-existing fails характеризационного сьюта по данным #963).

## 6. Риски и митигации

| Риск | Митигация |
|---|---|
| Б6 честно отдаёт 409 там, где раньше молча перезаписывал → рост видимых 409 | Порядок выката: сначала frontend Ф1–Ф4 (убирают само-генерацию 409), потом Б5–Б6; stage-наблюдение за save-conflict телеметрией 24 ч. |
| Конфликт мерджа с #963 (saveCoordinator.js, autosaveConfig.js) | Сначала merge #963, rebase этой ветки; наши изменения — в других функциях. |
| Field-scoped UPDATE (Б5) расходится с ORM-моделью | Тест на фиксированный набор полей; code-review с владельцем storage. |
| Потеря subprocess-sync при падении воркера | Идемпотентная задача + lazy-heal при навигации (уже есть) + метрика pending. |

## 7. Порядок выката (после approve и реализации)

1. Merge PR #963 (polling + lanes + timeout 60 s) — независим.
2. Эта ветка: frontend Ф1–Ф4 → stage (наблюдение 24 ч: 0 само-409 в телеметрии).
3. Backend Б5–Б6 → stage.
4. Backend Б1–Б4 под флагом → замер p95 → флаг default 1.
5. EXEC_REPORT.md в контуре, mirror в Obsidian, PR на русском. Merge/deploy — только после approve пользователя.

## 8. Definition of Done

- Ф1–Ф5, Б1–Б6 реализованы, тесты зелёные (новые + 0-дельта регрессий).
- Acceptance из §1 подтверждён замерами на stage.
- Порядок выката §7 соблюдён; каждый merge/deploy — с явным approve.
