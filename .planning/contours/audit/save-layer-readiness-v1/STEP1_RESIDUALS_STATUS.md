# STEP1_RESIDUALS_STATUS — аудит остатков feature/async-save-pipeline-step1

> Дата: 2026-09-16. Аудитор: Executor (read-only, контур `audit/save-layer-readiness-v1`).
> База проверки: `origin/main` @ `ae91569b` (worktree `p0-work-audit-dbplane`), НЕ отчёты контура.
> Источник списка: PLAN.md §12 (scope step2, 6 пунктов) + EXEC_REPORT.md «открытые остатки» + REVIEW_REPORT (N-new-1).

## Сводная таблица

| # | Residual | Статус | Куда делегирован | Evidence (main) |
|---|---|---|---|---|
| a | Undo sent-unacked op в окне RTT | **OPEN** | step2 п.1 (N-new-1) | `createSaveOutbox.js:325,474-475` |
| b | Ordering parent re-embed | **OPEN** | step2 п.3 (NIT-1) | `_legacy_main.py:5002-5041` vs `:5048` |
| c | Dead keepalive-бюджет код | **OPEN** | step2 п.4 (NIT-2) | `opsBatchSerializer.js:60`, `opsOutboxConfig.js:31,37` |
| d | Двойная регистрация роута /operations | **OPEN** | step2 п.5 (NIT-4) | `_legacy_main.py:4851` + `routers/sessions.py:243` |
| e | Manual full-save ack wipe | **OPEN** | step2 п.2 (residual BLOCKER-2) | `createSaveOutbox.js:565-575` |
| f | Reconnect / create-op replay | **OPEN** | step2 п.6 | `opsRebase.js:96-97`, `commandToOps.js:241` |

Итог: **0/6 закрыто в коде main; 6/6 осознанно отложены в step2** (условие владельца на merge step1, PLAN §12). Ветка step2 на origin **не создана** (проверено: `git ls-remote --heads origin` — совпадений по `outbox|step2|indexeddb|async-save-pipeline-step2` нет).

## По-пунктный разбор

### a. Undo sent-unacked op в окне RTT (N-new-1) — OPEN

- **Суть дефекта:** dispatch [A,B,C] фиксирует `inFlightSentCount=3`; undo неподтверждённой B во время полёта (splice по индексу < sentCount) → push D → ack делает `buffer.splice(0, 3)` и снимает вместе с A,C (acked) **неотправленную D**.
- **Код в main:** `frontend/src/features/process/bpmn/save/opsOutbox/createSaveOutbox.js:325` — на диспетчеризации `inFlightSentCount = buffer.length` (индексная семантика); `:474-475` — `_onAck` делает `buffer.splice(0, Math.min(inFlightSentCount, buffer.length))`. Отдельного detached-списка `pendingAck = buffer.splice(0)` в файле **нет** (grep по `pendingAck` пуст). Рекомендованный ревьюером фикс не применён.
- **Вердикт:** OPEN, рекомендован до prod-деплоя (REVIEW: «исправить в step2 до prod-деплоя, не блокируя PR-флоу»). Окно: RTT ops-запроса (~100–300 мс) + undo + правка.

### b. Ordering parent re-embed (NIT-1) — OPEN

- **Суть:** parent re-embed выполняется **до** SQL-CAS child; при CAS-409 parent уже перезаписан новым child-XML, child-строка — нет (transient divergence). Зеркалит существующий `session_bpmn_save` (pre-existing паттерн).
- **Код в main:** `backend/app/_legacy_main.py:5002-5041` — блок `re_embed_child_xml_into_parent` + `st.save(parent)`; `:5048` — `_save_session_with_cas(...)` child **после**. Порядок не изменён относительно описания ревью.
- **Вердикт:** OPEN (осознанно deferred, не блокер step1). Решение «привести API.md §3 к факту или перенести re-embed после commit» — не принято, материал step2 п.3.

### c. Dead keepalive-бюджет код (NIT-2) — OPEN

- **Код в main:**
  - `frontend/src/features/process/bpmn/save/opsOutbox/opsBatchSerializer.js:60` — `isWithinKeepaliveBudget` экспортируется, в `frontend/src` **нигде не вызывается** (grep по всему src: только определение);
  - `frontend/src/features/process/bpmn/save/opsOutbox/opsOutboxConfig.js:31` — `keepaliveBodyLimitBytes: 64*1024` и `:37` — `pageHideDrainTimeoutMs: 1500` — в src не используются.
- UI.md §7 обещает keepalive-бюджет ~64 kB — не реализован (размер считается в `buildBatchBody`, но проверка не enforced).
- **Вердикт:** OPEN (deferred, step2 п.4: «реализовать или удалить»).

### d. Двойная регистрация роута POST /operations — OPEN

- **Код в main:**
  - `backend/app/_legacy_main.py:4851` — `@app.post("/api/sessions/{session_id}/operations")` `session_operations_apply`;
  - `backend/app/routers/sessions.py:243` — `@router.post('/api/sessions/{session_id}/operations')`.
- Оба ведут в одну функцию; продовый entrypoint обслуживает router-вариант (`create_app` → `routers/sessions.py` → `session_service.operations_apply` → `_legacy_main.session_operations_apply`). Legacy-app не обслуживается entrypoint'ом.
- **Вердикт:** OPEN (deferred, step2 п.5: убрать legacy-копию при завершении миграции роутов). Технический долг без runtime-эффекта.

### e. Manual full-save ack wipe — OPEN

- **Суть:** ручное сохранение (не outbox-initiated) по ack чистит весь ops-буфер; ops, добавленные во время ручного сохранения, теряются без отправки.
- **Код в main:** `createSaveOutbox.js:565-575` — outbox-initiated путь защищён (`fullSavePreserveFrom > 0` → `buffer.slice(fullSavePreserveFrom)`, `:571-573`); manual путь → `clearBuffer()` (`:575`). Version-based reconciliation не реализован.
- **Вердикт:** OPEN (deferred, step2 п.2). Outbox-initiated путь закрыт (`fullSavePreserveFrom` — createSaveOutbox.js:302,532-540), manual — нет.

### f. Reconnect / create-op replay — OPEN

- **Reconnect:** `frontend/src/features/process/bpmn/save/opsOutbox/commandToOps.js:241` — `WHITELIST` не содержит `connection.reconnect*` (grep `reconnect` по src даёт только комментарий в `commandToOps.js:13` и тест); вне whitelist → `needsFullSave` fallback. Включение в vocabulary — step2 п.6 (после замера доли coverage).
- **Create-op replay:** `frontend/src/features/process/bpmn/save/opsOutbox/opsRebase.js:96-97` — `shape.create`/`connection.create` при rebase возвращают `{ok:false, error:"create_replay_not_supported", fuzzyMiss:true}` → `needsFullSave` fallback (`:222`). Ре-генерация id сервером при replay — нерешённая проблема, материал step2.
- **Вердикт:** OPEN (deferred, step2 п.6).

## Методологическая заметка

Все 6 пунктов — не EVIDENCE GAP: каждый подтверждён прямым чтением кода в `origin/main @ ae91569b` (файл:строка выше). Совпадение с отчётами контура (EXEC_REPORT «открытые остатки» ↔ PLAN §12) полное, расхождений нет.
