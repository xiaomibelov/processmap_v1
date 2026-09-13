# 5-PLANE PROOF — safe-pipeline-audit-v1

Каждая находка подтверждена на 5 плоскостях. Base: `processmap_v1@main (2f1f6444)`.

---

## F1 — Timeout-abort ≠ server rollback (HIGH)

| Плоскость | Доказательство |
|---|---|
| 1. UX / пользователь | Медленный save (схема с подпроцессами) → спиннер/тишина ≥10 s → «ошибка сохранения» → при следующем тике автосейва конфликт-модалка 409 в одиночной вкладке → все сохранения встают. |
| 2. API / контракт | `PUT /api/sessions/{id}/bpmn` отвечает только после полного subprocess-sync (`session_service.bpmn_save` ждёт `auto_create_subprocess_sessions` до return). Таймаута/асинхронности в контракте нет. |
| 3. Frontend state | `saveCoordinator._runTransportWithTimeout`: `controller.abort()` по таймауту; комментарий «so the server never receives the request» ложен для уже отправленного fetch. Ветка ошибки таймаута: `rollbackTrackedDiagramStateVersion`, без reconcile (reconcile только в ветке `isConflictResponse`). |
| 4. Backend concurrency | Ядро save уже закоммичено через SQL-CAS внутри `_lm.session_bpmn_save` до начала sync-блока; abort со стороны клиента на сервер никак не влияет (нет cancellation). |
| 5. Data | `diagram_state_version` инкрементирован, `session_state_versions`/`bpmn_versions` строки созданы — серверная правда расходится с клиентской tracked-base. |

**Вывод:** self-409 детерминированно воспроизводится связкой «медленный save + 10 s таймаут».

## F2 — Post-CAS write без CAS и вне lock (HIGH)

| Плоскость | Доказательство |
|---|---|
| 1. UX | Проявляется как редкий «откат» meta-полей/счётчиков подпроцессов при параллельной работе; косвенно — недоверие к сохранениям. |
| 2. API | Тот же `PUT /bpmn`: после `ok:true`-ядра сервис дописывает `bpmn_meta.subprocesses_*` отдельным save. |
| 3. Frontend state | Не виден (происходит на сервере внутри одного запроса). |
| 4. Backend concurrency | `st.save(s, is_admin=True)` — legacy full-row upsert без `expected_diagram_state_version`; Redis-lock к этому моменту отпущен (область lock — `_lm.session_bpmn_save`). Окно re-load → save не защищено. |
| 5. Data | Полный upsert строки sessions: конкурентная CAS-запись, попавшая в окно, затирается молча (LWW) — то, против чего строился `_save_session_with_cas`. |

**Вывод:** CAS перфорирован на собственном главном endpoint; закрывается переносом meta-записи в CAS-транзакцию или выносом счётчиков в read-model.

## F3 — 423 retry budget < lock TTL (MEDIUM)

| Плоскость | Доказательство |
|---|---|
| 1. UX | Property save при одновременном автосейве → «Session is being updated» после ~7–8 s ретраев, хотя через ~15 s всё штатно. |
| 2. API | Lock неблокирующий: занятость = немедленный 423 (без `Retry-After`). |
| 3. Frontend state | 423 — не конфликт (`conflictModel`: safe retry), идёт в generic retry: 1+2+4 s ≤ cap 4 s, retryCount 3. |
| 4. Backend concurrency | TTL lock 15 s (`_DEFAULT_TTL_MS`); конкурент по одному ключу `pm:lock:session:{sid}` — property-save и autosave делят один lock. |
| 5. Data | Не затрагивается (записи нет), проблема чисто UX/failure-rate. |

**Вывод:** бюджет ожидания клиента (~8 s) структурно меньше худшего легитимного удержания lock'а (15 s).

## F4 — Conflict gate без self-heal (MEDIUM)

| Плоскость | Доказательство |
|---|---|
| 1. UX | Модалка конфликта при self-409; пока пользователь не выбрал действие — автосейв мёртв, правки копятся локально. |
| 2. API | 409-payload уже несёт `server_last_write.client_id` + `actor_label` (достаточно для детерминированного self-detection). |
| 3. Frontend state | `conflicts.set(sid, ...)` → `_buildConflictGateResult` на все pipeline'ы; `resolveConflict` — только ручной; TTL/эскалации нет. |
| 4. Backend concurrency | — (проблема клиентская; сервер уже даёт нужные данные). |
| 5. Data | При закрытии вкладки с вооружённым gate несохранённые правки теряются (есть only-beforeunload сигнал через `hasUnsavedChanges`). |

**Вывод:** инфраструктура для авто-resolve self-conflict (`X-PM-Client-Id` → `server_last_write.client_id`) поставлена контуром save-revision-hygiene, но не использована.

## F5 — Head-of-line blocking единой очереди (MEDIUM)

| Плоскость | Доказательство |
|---|---|
| 1. UX | Редактирование свойств «подвисает» на секунды, пока впереди идёт медленный xml-PUT. |
| 2. API | Независимые endpoint'ы (PUT /bpmn, PATCH /sessions) физически параллельны — блокировка только клиентская. |
| 3. Frontend state | `queueKey(_pipelineName, sessionId)` = sessionId: `_enqueueRun` строит единую цепочку промисов на сессию для всех pipeline'ов. |
| 4. Backend concurrency | Серверный порядок всё равно гарантируют SQL-CAS + lock, значит клиентская моно-очередь избыточна как единственный механизм. |
| 5. Data | Не затрагивается. |

**Вывод:** после ускорения core-save (F1) приоритет падает; стратегически — две линии (interactive/background).

## F6 — BASE_VERSION_REQUIRED как регрессионная ловушка (LOW)

| Плоскость | Доказательство |
|---|---|
| 1. UX | Прецедент: смена статуса → 409 (контур transaction-session-status). |
| 2. API | 409 `DIAGRAM_STATE_BASE_VERSION_REQUIRED` при отсутствии base на любом diagram-truth ключе. |
| 3. Frontend state | Каждый новый call-site обязан прокидывать base; дисциплина держится на patchKeys-gate (PR #958). |
| 4. Backend concurrency | `_DIAGRAM_TRUTH_PATCH_KEYS` расширяется без автоматического контроля call-site'ов. |
| 5. Data | Не затрагивается. |

**Вывод:** нужен контрактный тест-инвентарь write-endpoint'ов (требует base / whitelist).

## F7 — Silent lock-bypass (LOW)

| Плоскость | Доказательство |
|---|---|
| 1. UX | При деградации Redis — всплеск 409/423-эффектов без видимой причины. |
| 2. API | Поведение endpoint'ов не меняется. |
| 3. Frontend state | Не виден. |
| 4. Backend concurrency | `acquire_session_lock`: `conn is None` или исключение → `acquired=True, bypass=True`; защита остаётся только SQL-CAS. |
| 5. Data | Целостность сохраняется (CAS), теряется сглаживание. |

**Вывод:** нужен metric/alert на bypass; код менять не требуется.
