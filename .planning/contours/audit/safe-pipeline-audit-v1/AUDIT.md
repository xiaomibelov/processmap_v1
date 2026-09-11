# AUDIT — safe-pipeline-audit-v1

**Контур:** audit/safe-pipeline-audit-v1
**Дата:** 2026-09-12
**База:** `xiaomibelov/processmap_v1` @ `main` (`2f1f6444`, вкл. PR #958 «0×409 в одиночной сессии»)
**Цель (от PO):** обычный рабочий процесс без 409 и без торможений для пользователя при любых сохранениях.
**Рамки:** только диагностика. Product code не менялся. Merge/deploy/PR — только после approve.

---

## 0. Текущая архитектура save-пайплайна (что уже сделано — коротко)

| Слой | Механизм | Где |
|---|---|---|
| Frontend | Единый `saveCoordinator`: per-session очередь, дебаунс, retry с backoff, conflict gate | `frontend/src/features/session/saveCoordinator.js` |
| Frontend | Трекер CAS-базы `casVersionTracker` + канонический reader `casResponse.js` | `frontend/src/lib/casVersionTracker.js`, `features/session/casResponse.js` |
| Frontend | Кросс-таб синх версий (BroadcastChannel), clean-вкладка adopt'ит, dirty — баннер | `frontend/src/lib/crossTabVersionSync.js` (PR #958) |
| Frontend | BPMN-координатор: autosave debounce 10 s, drag-throttle 5 s, unchanged-hash skip | `createBpmnCoordinator.js`, `autosaveConfig.js` |
| Backend | In-memory CAS guard + SQL-level CAS (`expected_diagram_state_version`) | `backend/app/utils/session_helpers.py` |
| Backend | Redis-lock на сессию (TTL 15 s), 423 при занятости; bypass при недоступном Redis | `backend/app/redis_lock.py` |
| Backend | No-op guard: идентичный XML+meta → 200 с текущим dsv, replay со stale base ≠ 409 | контур fix/save-revision-hygiene |
| Contract | 409 payload: `server_current_version`, `server_last_write{actor, client_id, changed_keys}` | `_diagram_state_conflict_payload` |

Вывод: «скелет» правильный. SQL-CAS закрывает check-then-act, 404 отделён от 409, guard-коды (DRAFT_GRAPH_READ_ONLY_XML_TRUTH) не маскируются под конфликт. Оставшиеся проблемы — в **стыках**: latency хвоста сохранения, одна разблокированная запись после CAS и детерминированная блокировка UX на ложных 409.

---

## Находки

### F1 — HIGH. Таймаут-аборт фронта ≠ откат на сервере: цепочка «торможение → self-409 → заморозка сохранений»

**Механизм.**
1. `PUT /api/sessions/{id}/bpmn` после ядра сохранения **синхронно** выполняет `auto_create_subprocess_sessions` — рекурсивная материализация подпроцессов (глубина ≤ 8), per-element DB-записи, инвалидация кэшей (`session_service.py::bpmn_save`). На схемах с десятками подпроцессов это секунды на КАЖДЫЙ save (замер в коде: 94 ms/элемент на 724 KB до оптимизации parse-once).
2. Фронт: `xmlPipeline.transportTimeoutMs = 10_000` (`autosaveConfig.js`). `_runTransportWithTimeout` по таймауту делает `controller.abort()` и комментарий «Abort the real fetch **so the server never receives the request**» — **неверен**: запрос уже ушёл, сервер продолжает работу и **коммитит** запись (dsv инкрементирован).
3. Клиент при этом: `rollbackTrackedDiagramStateVersion` + outcome "error". Reconcile-хук (`reconcileConflict`) вызывается **только на 409**, на таймаут — нет.
4. Следующий autosave идёт со stale tracked-base → настоящий 409 в **одиночной** вкладке → взводится conflict gate → ВСЕ сохранения сессии заморожены до явного действия пользователя.

Это и есть наблюдаемый пользователем сценарий «тормозит, потом 409, потом всё встало».

**Доказательства:** `saveCoordinator.js::_runTransportWithTimeout` (abort + ложный комментарий), ветка таймаута без reconcile; `session_service.py::bpmn_save` (синхронный subprocess-sync после `ok:true`); `autosaveConfig.js` (timeout 10 s).

**Рекомендации (приоритет):**
- R1.1: вынести subprocess-sync из request-path (celery-задача / lazy on navigate). `PUT /bpmn` обязан отвечать сразу после CAS-commit.
- R1.2: при transport-timeout выполнять reconcile (GET `/meta`, сравнить dsv / `server_last_write.client_id` / payload-hash) ДО объявления ошибки — «наша запись закоммичена» = успех, а не failure.
- R1.3: поднять `transportTimeoutMs` выше p95 реального save (до R1.1 — минимум 25–30 s), либо сделать таймаут адаптивным под размер XML.

---

### F2 — HIGH. Post-CAS запись `bpmn_meta` вне lock и без SQL-CAS на том же endpoint

**Механизм.** В `session_service.bpmn_save` после возврата из `_lm.session_bpmn_save` (lock уже отпущен, CAS-commit сделан) выполняется повторная загрузка сессии и `st.save(s, is_admin=True)` — **полный row-upsert без `expected_diagram_state_version`** и вне Redis-lock. Окно между re-load и save — silent last-writer-wins: конкурентная CAS-защищённая запись может быть перезаписана. CAS построен ровно против этого, и здесь он обходится на том же самом endpoint.

**Доказательства:** `session_service.py::bpmn_save` — ветка `meta["subprocesses_total"]...` → `st.save(s, is_admin=True)`; `_save_session_with_cas` — legacy-path без base = full-row upsert.

**Рекомендации:**
- R2.1: обновление `bpmn_meta.subprocesses_*` перенести внутрь CAS-транзакции ядра (один `_save_session_with_cas` с `changed_keys`), либо
- R2.2: убрать эти счётчики из сессионной строки вообще (вычисляемый read-model), либо
- R2.3 (временно): расширить lock на весь `bpmn_save` сервисного слоя.

---

### F3 — MEDIUM. 423-retry бюджет фронта меньше TTL lock'а: ложный failure в одиночном сценарии

**Механизм.** Lock TTL = 15 s; lock не блокирующий — занятость сразу даёт 423. Фронт ретраит не-409 ошибки с backoff 1 s → 2 s → 4 s (cap 4 s) — суммарно ≈ 7–8 s ожидания. Если конкурирующий save (того же пользователя: property-save против autosave — один lock на сессию) держит lock дольше, ретраи исчерпываются → ошибка пользователю при физически штатной ситуации. `conflictModel.js` уже классифицирует 423 как «безопасно ретраить», но бюджет ретрая под это не выделен.

**Доказательства:** `redis_lock.py` (`_DEFAULT_TTL_MS=15000`, `nx=True` без ожидания); `saveCoordinator.js` (retryCount=3, retryDelayMs=1000, maxRetryDelayMs=4000); SUMMARY аудита extension-state-save-failure (H2 — та же гонка).

**Рекомендации:**
- R3.1: сервер — короткое ожидание lock'а (wait-with-timeout 3–5 s) вместо мгновенного 423;
- R3.2: фронт — отдельный retry-бюджет для 423 (больше попыток, honor `Retry-After`);
- R3.3: метрика частоты 423 по endpoint'ам (сейчас только warning-лог).

---

### F4 — MEDIUM. Conflict gate не имеет self-heal: ложный 409 = вечная пауза автосейва

**Механизм.** Любой 409 (включая self-conflict из F1) взводит gate: все pipeline'ы сессии блокируются до явного refresh/overwrite/cancel. `hasUnsavedChanges()` остаётся true. Если пользователь не понял модалку или свернул вкладку — правки копятся несохранёнными (риск потери + ощущение «зависло»). При этом **детерминированный детектор self-conflict уже поставлен**: в 409-payload приходит `server_last_write.client_id` (контур save-revision-hygiene, заголовок `X-PM-Client-Id`). Совпадение client_id с нашим = это наша же запись (другая вкладка/ретрай/timeout-commit) → можно авто-resolve (adopt server version + replay) БЕЗ модалки. Модалка нужна только при ЧУЖОМ client_id/actor.

**Доказательства:** `saveCoordinator.js::_buildConflictGateResult`, `resolveConflict` (только ручной путь); `_build_server_last_write_payload` (client_id уже отдаётся); `crossTabVersionSync` (половина механизма уже есть).

**Рекомендации:**
- R4.1: auto-resolve self-conflict по `client_id` (наш) — adopt + replay, тост «синхронизировано», без модалки;
- R4.2: gate-TTL/эскалация: повторный reconcile через N секунд, а не вечная блокировка;
- R4.3: различать в UI «другая ваша вкладка» vs «другой пользователь» (actor_label уже в payload).

---

### F5 — MEDIUM. Head-of-line blocking: одна очередь на сессию для всех pipeline'ов

**Механизм.** `queueKey(_pipelineName, sessionId)` игнорирует имя pipeline — xml, meta, analysis сериализуются в одну очередь. Медленный xml-PUT (до 10 s, см. F1) задерживает интерактивные meta/property сохранения за собой → «торможение» при редактировании свойств. Дебаунс при этом per-pipeline, то есть очередь — единственная точка упорядочивания.

**Доказательства:** `saveCoordinator.js::queueKey`, `_enqueueRun`.

**Рекомендации:**
- R5.1: после R1.1 (быстрый core-save) проблема сильно смягчается — сначала F1;
- R5.2: приоритезация интерактивных сохранений (property/status) над фоновым autosave внутри очереди, либо две линии (interactive/background) с серверным порядком через CAS (порядок всё равно гарантирует SQL-CAS + lock).

---

### F6 — LOW. `DIAGRAM_STATE_BASE_VERSION_REQUIRED` как ловушка регрессий

Любой пишущий endpoint, попавший под `_DIAGRAM_TRUTH_PATCH_KEYS` без прокидывания base, получает 409. Прецедент уже был (transaction-session-status: status-patch без base → 409). Сейчас status вынесен в dedicated endpoint. Риск повторяется при каждом расширении truth-ключей.

**Рекомендация:** контрактный тест-инвентарь: каждый write-endpoint с diagram-ключами либо требует base (явно задокументирован), либо в whitelist-исключениях; расширение `_DIAGRAM_TRUTH_PATCH_KEYS` без обновления инвентаря = красный CI.

---

### F7 — LOW. Lock-bypass при недоступном Redis — только warning-лог

`acquire_session_lock` молча деградирует в bypass (acquired=True). Целостность при этом держится на SQL-CAS (это корректно), но 423-сглаживание исчезает, и всплеск 409 при деградации Redis будет необъясним без метрики.

**Рекомендация:** counter/metric на bypass + alert.

---

## Что НЕ является проблемой (проверено)

- Check-then-act между in-memory guard и upsert — закрыт SQL-level CAS (`expected_diagram_state_version`, 0 rows → 409). ✅
- 404 (удалённая сессия) отделён от 409 на обоих концах; фронт не ретраит и не показывает conflict-модал. ✅
- Guard 409 `DRAFT_GRAPH_READ_ONLY_XML_TRUTH` не взводит conflict gate и не откатывает tracked-base. ✅
- No-op guard: идентичный контент / replay со stale base → 200, не 409, без лишних ревизий. ✅
- Кросс-таб: clean-вкладка adopt'ит версию монотонно (без ложного 409), dirty — баннер, publish-цикл задавлен. ✅ (PR #958)
- `_effective_sql_cas_base` + `FPC_E2E_CAS_BYPASS` — bypass только env-флагом, помечен как E2E-only. ⚠️ проконтролировать, что флага нет в prod-окружении (проверка по репозиторию: в docker-compose.prod* не найден — ОК).

## Рекомендуемый порядок работ (для fix-контуров)

1. **fix/save-latency-subprocess-async** (F1: R1.1 + R1.2, R1.3 как stop-gap) — убирает корневую цепочку «торможение → self-409».
2. **fix/save-post-cas-write** (F2: R2.1/R2.2) — закрывает дыру в CAS на главном endpoint.
3. **fix/save-self-conflict-autoresolve** (F4: R4.1–R4.3) — пользователь перестаёт видеть 409 там, где конфликт был с самим собой.
4. **fix/save-423-retry-budget** (F3) — дёшево, снимает ложные failure.
5. F5/F6/F7 — по остаточному принципу после замеров.

**Acceptance для всего трека:** сценарий «один пользователь, одна вкладка, схема 250+ элементов и 30+ подпроцессов» — 0 видимых 409, 0 конфликт-модалок, p95 `PUT /bpmn` < 2 s, ни один save не завершается ошибкой при физически успешном коммите.
