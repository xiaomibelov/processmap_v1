# PLAN — fix/save-latency-subprocess-async

**Контур:** fix/save-latency-subprocess-async
**Ветка:** `fix/save-latency-subprocess-async`
**Base:** `origin/main` (`2f1f6444`)
**Дата:** 2026-09-12
**Источник:** audit/safe-pipeline-audit-v1, находка **F1 (HIGH)** + stop-gap **R1.3**
**Статус:** ⏳ ждёт approve PLAN.md. Код не начинаем до approve.

---

## 1. Цель

`PUT /api/sessions/{id}/bpmn` отвечает сразу после CAS-commit ядра сохранения. Тяжёлая материализация подпроцессов убирается из request-path автосейва. Таймаут транспорта фронта перестаёт порождать self-409 (reconcile вместо мгновенного failure).

**Acceptance (замеряемо):**
- Сценарий «одна вкладка, схема 250+ элементов, 30+ подпроцессов»: p95 `PUT /bpmn` < 2 s (canvas-сохранения), 0 видимых 409, 0 конфликт-модалок.
- Ни один save не завершается ошибкой на клиенте при физически успешном коммите на сервере.
- Subprocess-sync по-прежнему выполняется полностью (никаких потерянных детей), просто асинхронно.

## 2. Root cause (из аудита)

1. `session_service.bpmn_save` после `ok:true` ядра синхронно выполняет `auto_create_subprocess_sessions` (рекурсия ≤ 8, per-element DB-записи, инвалидация кэшей) → секунды latency на КАЖДЫЙ canvas-save.
2. Фронт `xmlPipeline.transportTimeoutMs = 10_000` + `controller.abort()` по таймауту. Комментарий «server never receives the request» неверен: сервер коммитит, клиент делает `rollbackTrackedDiagramStateVersion` → следующий save → self-409 → conflict gate замораживает все сохранения.
3. Reconcile-хук существует, но вызывается только на 409, не на таймаут.

## 3. Non-goals (вне этого контура)

- F2 (post-CAS запись `bpmn_meta` без CAS) — отдельный fix-контур `save-post-cas-write`. Здесь только НЕ усугубляем (см. §5, шаг Б3).
- F3/F4/F5 — отдельные контуры по плану аудита.
- Рефакторинг `_legacy_main` / перенос endpoint'ов.
- Merge/deploy/PR в main — только после approve.

## 4. Дизайн-решение (предлагаемое, обсуждается на approve)

Разделяем два класса вызовов `PUT /bpmn` по `source_action`:

| Класс | source_action | Поведение sync-блока |
|---|---|---|
| Явный импорт файла | `bpmn_upload`, `import`, `bpmn_restore` | **Синхронно** (как сейчас): пользователь ждёт результат импорта, счётчики `subprocesses_*` в ответе сохраняются. Контракт ответа не меняется. |
| Canvas-сохранения | `autosave`, `manual`, `flush_save*`, `property_*`, пустой/прочие | **Асинхронно**: ответ сразу после CAS-commit; sync — celery-задача. |

Обоснование: импорт — редкая пользовательская операция с ожиданием результата; автосейв — горячий путь, где subprocess-материализация на каждый чих не нужна (дети уже материализованы первым сохранением/импортом, дальше sync идемпотентен).

## 5. План работ

### Backend

- **Б1.** Celery-задача `sync_subprocesses_task(session_id, org_id)` (`backend/app/tasks.py` или соседний модуль по образцу overlay-render):
  - acquire `acquire_session_lock(session_id, ttl_ms=120000)` (длинный TTL под тяжёлый sync); занято → retry задачи с backoff (celery countdown), N попыток;
  - идемпотентность: вся логика `auto_create_subprocess_sessions` уже идемпотентна (find_or_create + refresh);
  - НЕ пишет `bpmn_meta.subprocesses_*` в сессионную строку (чтобы не создавать post-CAS LWW-запись — не усугубляем F2); счётчики для async-пути возвращаются read-model'ю (см. Б3);
  - ошибки → лог + метрика, не ретраим бесконечно (max 3).
- **Б2.** `session_service.bpmn_save`: dispatch по таблице §4. Для async-класса — `sync_subprocesses_task.delay(...)` ПОСЛЕ успешного `ok:true`; ответ дополняется `subprocesses_sync: "pending"` (additive, обратно совместимо).
- **Б3.** Счётчики `subprocesses_total/created/has_more` для async-пути — вычисляемые при чтении (meta-endpoint), а не запись в строку сессии. Если на approve решим оставить запись — то только через `_save_session_with_cas` (это уже пересечение с F2, явно отметить).
- **Б4.** Feature-flag `FPC_ASYNC_SUBPROCESS_SYNC` (default `0`); включение на stage → замер p95 → default `1` отдельным release-шагом. Откат = выключить флаг.

### Frontend

- **Ф1.** Timeout-reconcile в `saveCoordinator`: при transport-timeout (и abort) перед объявлением failure — один reconcile-запрос `GET /api/sessions/{id}/meta`:
  - `diagram_state_version` вырос относительно отправленной base **и** `current_session_payload_hash` совпадает с хэшем отправленного payload (hash уже считается для unchanged-check) → трактуем как УСПЕХ: adopt dsv через `bumpTrackedDiagramStateVersion`, `pipeline_success`, никакой ошибки пользователю;
  - иначе → прежний failure-path.
  - Хук оформить как `reconcileTimeout` в конфиге pipeline (по образцу `reconcileConflict`), реализация в xml-pipeline (`saveBpmnState.js` / `createBpmnPersistence.js`).
- **Ф2.** Stop-gap R1.3: `xmlPipeline.transportTimeoutMs: 10_000 → 30_000` в `autosaveConfig.js` (под флагом Б4 тоже допустимо вернуть к 10–15 s после включения async). Удалить ложный комментарий про «server never receives the request», заменить фактическим.
- **Ф3.** Индикатор: при `subprocesses_sync: "pending"` в ответе — ненавязчивый статус «Подпроцессы синхронизируются…» в save-статусе (без блокировки UI). Импорт-путь (sync) не трогаем.

### Tests

- **Backend unit (RED→GREEN):**
  - canvas-save (autosave) → ответ без sync-блока, задача поставлена (mock celery), `subprocesses_sync == "pending"`;
  - импорт (`bpmn_upload`) → прежнее синхронное поведение, счётчики в ответе;
  - задача: lock busy → retry; идемпотентный повторный запуск; НЕ изменяет `diagram_state_version` и НЕ делает full-row upsert meta (гард-тест против F2-регрессии);
  - флаг выключен → бай-ин-байт прежнее поведение.
- **Frontend unit:**
  - timeout + reconcile-совпадение (dsv вырос, hash совпал) → success, tracked-base adopt'нута, 0 ошибок наружу;
  - timeout + reconcile-расхождение → прежний failure;
  - timeout при недоступном meta-endpoint → прежний failure, без зацикливания.
- **E2E (canvas-editing-stability.spec.mjs, новый сценарий):**
  - схема 250+ элементов с 30+ подпроцессами: серия правок → 0×409, 0 конфликт-модалок, все PUT успешны; замер gaps/duration в лог теста;
  - искусственно замедленный `PUT /bpmn` (route interception > 10 s) → после Ф1 save завершается успехом через reconcile, следующий save без 409.
- **Регрессии:** `node --test` фронт, `backend/tests` — дельта падений против main = 0.

## 6. Риски и митигации

| Риск | Митигация |
|---|---|
| Потеря sync при падении воркера между commit и задачей | Задача идемпотентна; дополнительный lazy-trigger: навигация в подпроцесс (`navigate_to_subprocess`) и так self-heal'ит child (уже реализовано); метрика «sync pending > N минут». |
| Гонка задачи с новым save | Задача берёт session lock; SQL-CAS в ядре сохранений не зависит от задачи; задача не пишет в сессионную строку (Б1). |
| Пользователь импорта не видит счётчики | Импорт остаётся синхронным (§4). |
| p95 не упал после async (другой узкий участок) | Замер до/после на stage (saveDiagnosticsTrail уже пишет `ms`); откат флагом. |

## 7. Definition of Done

- Б1–Б4, Ф1–Ф3 реализованы, тесты зелёные (новые + регрессии 0-дельта).
- Stage-замер: p95 `PUT /bpmn` (canvas) < 2 s на схеме 250+/30+; 0 само-409 в save-диагностике за 24 ч stage.
- EXEC_REPORT.md в контуре, mirror в Obsidian, PR на русском. Merge/deploy — только после approve пользователя.
