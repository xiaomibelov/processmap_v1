# IMPLEMENTATION — fix/save-latency-subprocess-async (по PLAN v2)

**База:** `origin/main` ПОСЛЕ merge PR #963 (queueKey = per-pipeline lanes, `transportTimeoutMs: 60_000` — уже там).
**Предусловие:** PLAN.md v2 approved. Код до approve не начинаем.
**Принцип:** каждый этап — самостоятельно зелёный (unit RED→GREEN + 0-дельта регрессий), выкат этапами по §7 PLAN.

---

## Этап 0. Pre-flight (после merge #963)

1. Rebase ветки на main. Ожидаемые пересечения: `saveCoordinator.js` (queueKey уже lanes — наши правки в других функциях), `autosaveConfig.js` (не трогаем: таймаут 60 s остаётся).
2. Grep-обход (зафиксировать результаты в EXEC_REPORT):
   - все callers `rollbackTrackedDiagramStateVersion` (ожидаем: saveCoordinator + возможно createBpmnPersistence/saveBpmnState — если есть внешние, их семантика проверяется отдельно);
   - сигнатура `_save_session_with_cas` в `backend/app/utils/session_helpers.py` (expected-колонка, возврат/исключения);
   - side-effects `SessionStorage.save` (owner-scope guard, инвалидация кэшей, снапшоты) — чтобы Б5 не потерял инвалидацию;
   - где реализован `reconcileConflict` сейчас (какой pipeline регистрирует) — образец для Ф2;
   - кто вызывает `resolveConflict(..., "cancel")` (SaveConflictModal, ProcessStage) — UI-реакция на новую семантику Ф3.

---

## Этап 1. Ф1 — rollback-дисциплина (L1) · ~0.5 д · frontend

**Файл:** `frontend/src/features/session/saveCoordinator.js`

- `_runPipeline`: локальный `let bumpedInRun = false`; в `completeSuccess` после `bumpTrackedDiagramStateVersion` → `bumpedInRun = true`.
- Ветка 409: **убрать** `rollbackTrackedDiagramStateVersion(sid)` (base обновляется только через reconcile/resolveConflict).
- Ветки timeout/error/404: rollback — **только** если `bumpedInRun === true`.
- `casVersionTracker.js` не меняется.

**Тесты (node --test, RED→GREEN):**
1. успех (bump 7→8) → network error → следующий save уходит с base=8 (RED: уходит с 7);
2. timeout после успеха → base неизменен;
3. 409 → base неизменен до `resolveConflict`;
4. error ДО первого успеха (history из одного элемента) → поведение неизменно.

---

## Этап 2. Ф2 — timeout/network reconcile (L2) · ~1–1.5 д · frontend

**Файлы:** `saveCoordinator.js`, xml-pipeline (`saveBpmnState.js` / `createBpmnPersistence.js`), образец — существующий `reconcileConflict`.

- `registerPipeline`: новый опциональный хук `reconcileTimeout(errorOrResult, sid, builtPayload, payload)`.
- `_runPipeline`: на transport-timeout И на status-0 network error — до failure-path — вызвать хук (один раз, без ретраев); `{ok:true, ...}` → `completeSuccess({...reconciled, reconciled:true})`.
- Реализация хука в xml-pipeline: `GET /api/sessions/{id}/meta`; успех ⇔ `diagram_state_version > sentBase` И `current_session_payload_hash === hash(отправленного xml)` (hash переиспользовать из unchanged-check). Adopt — через обычный `completeSuccess` bump.
- Регистрируем хук только в xml-pipeline (у meta/analysis нет payload-hash; для них прежний failure, base теперь не портится — Этап 1).
- `_runTransportWithTimeout`: ложный комментарий заменить на: «abort прекращает ожидание ответа; сервер мог уже закоммитить — см. reconcileTimeout».

**Тесты:**
1. timeout + meta(dsv↑, hash match) → success, tracked adopt, наружу 0 ошибок;
2. timeout + meta(mismatch) → прежний failure (без rollback base);
3. timeout + meta 404/500/timeout → прежний failure, ровно один meta-запрос;
4. network error (status 0) + match → success;
5. reconcile-success не вызывает onError/on409.

---

## Этап 3. Ф3 — семантика resolveConflict (L3) · ~0.5 д · frontend

**Файл:** `saveCoordinator.js` (+ проверка callers из Этапа 0).

- `refresh` → `setTrackedDiagramStateVersion(sid, serverVersion)` (если serverVersion !== null) + удаление конфликта (как сейчас). Caller обязан перечитать данные — уже делает.
- `cancel` → конфликт **НЕ удаляется**; return `{ok:true, action:"cancel"}`; emit как сейчас. Следующий save → `_buildConflictGateResult` без транспорта → UI снова показывает модалку. Цикла 409 в сети нет.
- `overwrite` → без изменений.

**Тесты:** cancel → `getConflict(sid) !== null`, save не доходит до транспорта; refresh → tracked == serverVersion; overwrite → как раньше.

---

## Этап 4. Ф4 — rollback cross-tab notify (L10) · ~0.5 д · frontend

**Файлы:** `frontend/src/lib/casVersionTracker.js`, `frontend/src/lib/crossTabVersionSync.js`.

- `rollbackVersion` → `notifyVersionListeners("rollback", sid, current)` при реальном изменении.
- `crossTabVersionSync`: обработка типа `rollback` (adopt версии, без зацикливания — notify только при изменении, как в set/bump).

**Тесты:** listener получает `rollback`; вторая «вкладка» (двойной инстанс sync) adopt'ит версию.

---

## Этап 5. Б5 — recompute field-scoped (L4) · ~1 д · backend

**Файлы:** `backend/app/repositories/session_repo.py` (или `storage.py`), `backend/app/services/session_service.py`.

- Новый метод `update_derived_fields(session_id, fields: dict, *, user_id, org_id, is_admin)` — UPDATE строго перечисленных колонок: `normalized, resources, questions, mermaid_simple, mermaid_lanes, mermaid, analytics, version, updated_at`. `bpmn_xml`, `diagram_state_version`, `bpmn_meta` — **вне списка**.
- `recompute_session`: `get_storage().save(sess)` → `update_derived_fields(...)`; инвалидацию кэшей/owner-scope сохранить (по результатам Этапа 0).
- Ответ — прежний `sess.model_dump()` (контракт не ломаем; CPU recompute и вес ответа — отдельный контур оптимизации, здесь только корректность записи).

**Тесты:**
1. набор колонок UPDATE зафиксирован (white-list тест);
2. concurrency: `PUT /bpmn` во время recompute → XML и dsv от PUT не откатываются;
3. derived-поля обновляются (вопросы/аналитика свежие).

---

## Этап 6. Б6 — answer CAS-коммит (L5) · ~0.5 д · backend

**Файл:** `backend/app/session_answers.py`

- `st.save(s)` → `_save_session_with_cas(...)` с тем же base, что прошёл `_require_diagram_cas_or_409` (сигнатура — из Этапа 0). Гонка → `DiagramStateConflictError` → 409 (фронт обрабатывает gate'ом, base не портится — Этап 1).
- `_mark_diagram_truth_write` остаётся — проверить, что dsv+1 пишется атомарно в том же UPDATE.
- Контракт `{"error": "question not found"}` (HTTP 200) — не трогаем (отдельный low).

**Тесты:**
1. протухший base → 409 (сейчас: молчаливая перезапись после check);
2. параллельные answer + PUT → один успех, другой 409; lost update невозможен;
3. happy-path неизменен (ответ применён, dsv+1, actor в last_write).

---

## Этап 7. F1 — async subprocess sync (Б1–Б4) + Ф5 · ~2–3 д · fullstack

По PLAN v2 §5 без изменений: celery `sync_subprocesses_task` (lock TTL 120 s, backoff, ≤3 попыток, НЕ пишет сессионную строку); dispatch по `source_action`; `FPC_ASYNC_SUBPROCESS_SYNC` (default 0); счётчики async-пути — read-model (если инвазивно → запись через `_save_session_with_cas`, явно отметить как пересечение с F2); ответ `subprocesses_sync: "pending"` + индикатор Ф5.

**Тесты:** по PLAN v2 (mock celery, lock-busy retry, идемпотентность, гард dsv, флаг off = побайтовый паритет, импорт синхронен).

---

## Этап 8. E2E, замеры, отчёт · ~2 д

- `canvas-editing-stability.spec.mjs`: «медленный PUT + печать в интервью» → 0×409; схема 250+/30+ → 0×409, 0 модалок, замеры gaps/duration.
- Stage: p95 `PUT /bpmn` < 2 s; save-conflict телеметрия 24 ч = 0 само-409.
- `EXEC_REPORT.md` в контуре, mirror в Obsidian (`tools/pm-agent-mirror-report.sh` — локально у пользователя), PR на русском.

---

## Зависимости и порядок

```
Этап 0 ──┬─ Этапы 1–4 (frontend, параллелизуемы, общий файл saveCoordinator — вести одним PR)
         ├─ Этап 5 (backend, независим)
         ├─ Этап 6 (backend, независим; выкат ПОСЛЕ этапов 1–4 — см. §6 PLAN: честные 409)
         └─ Этап 7 (последним, под флагом)
Этап 8 — после всех.
```

**Выкат:** Этапы 1–4 → stage 24 ч → Этапы 5–6 → Этап 7 (флаг 0→1 после замера). Каждый merge/deploy — только с явным approve.

**Оценка суммарно:** ~6–8 рабочих дней с тестами.
