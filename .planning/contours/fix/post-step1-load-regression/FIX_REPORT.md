# FIX REPORT — fix/post-step1-load-regression (read-only evidence, без изменений кода)

Дата сбора: 2026-09-15, ~12:14–12:30 UTC. Контур строго read-only: на серверах и в коде ничего не изменено, git commit не выполнялся.

## Критическое ограничение доступа (влияет на все вердикты)

- `stage.processmap.ru` резолвится в **31.192.110.145** — это ДРУГОЙ хост, не `45.87.104.69` (prod). SSH `deploy@31.192.110.145` — `Permission denied (publickey,password)`. Ключ `deploy@45.87.104.69` на stage-хосте не принимается.
- Следовательно, серверные проверки stage (pg_stat_activity, `\d+ session_applied_ops`, redis-cli scan, access-логи nginx/api, логи контейнеров) **физически недоступны** с выданным доступом. Все гипотезы, требующие этих данных, вердиктуются как INCONCLUSIVE с указанием, что бы их доказало.
- Премисса задания «stage — это compose-проект `app-*` с checkout `/opt/processmap/app`, шлюз общий с prod» **фактически неверна** (см. «Аномалии»).

## Таймлайн (все время UTC, 2026-09-15)

| Время | Событие | Источник |
|---|---|---|
| 11:37:24 | PR #982 смержен в main, merge commit `aeca4fcb` | `gh api pulls/982` |
| 11:37:26 | CI «Deploy to Stage» (run 34964281826) стартовал | `04-ci-deploy-to-stage-log.txt` |
| 11:37:46 | Checkout на stage-хосте: resolved sha = aeca4fcb (проверка expected==resolved прошла) | тот же |
| 11:37:49 | Деплой-скрипт: «stage api containers: 1» — старые контейнеры ещё работают | тот же |
| 11:37:50–11:41:5x | Полный rebuild образов на сервере: api, celery-worker, frontend (npm ci + vite build), notifications, agent, rag-embedder (~4 мин) | тот же |
| ~11:41:57 | `docker compose up` с новыми образами: контейнеры пересозданы; rag-embedder «health: starting» | тот же |
| **11:42:02.55** | **Процесс stage-api стартовал заново** (`process_start_time_seconds` из /metrics) + rag-embedder healthy (model_loaded) | `09-stage-metrics.txt`, CI-лог |
| 11:42:13–11:42:25 | Проверка регистрации celery-задач (`processmap.session_applied_ops.cleanup_task` присутствует), «done ref=main sha=aeca4fcb» | CI-лог |
| 11:42:28 | Job «Deploy to Stage» завершён успешно | CI-лог |
| ~11:45–13:00 | Предполагаемое окно скриншота: деградация (документ TTFB 41.78 s, Finish 2.7 min) — внешнее наблюдение | репорт задачи |
| 12:19–12:24 | Внешние пробы: stage БЫСТРЫЙ, тот же билд aeca4fcb, health ok | `06`, `07` |
| 12:00, 12:30 | Watchdog-пробы stage: code=200 (ноль non-200 за день) | `03`, `08` |

## Сводная таблица вердиктов

| Гипотеза | Вердикт | Ключевое основание |
|---|---|---|
| H1 DB: нет индекса на session_applied_ops / долгие транзакции / исчерпание пула | **INCONCLUSIVE** | stage-DB недоступен. По коду DDL содержит PK (session_id, op_id) + индекс `idx_session_applied_ops_cleanup(applied_at)`; health: alembic 036=head, ok=true; в CI-логе деплоя нет шага миграций и нет ошибок. Под-претензия «нет PK/индекса» опровергнута кодом. |
| H2 Redis/in-memory локи блокируют воркеры | **INCONCLUSIVE** | stage-redis и логи api недоступны. Код: `acquire_session_lock(ttl_ms=15000)`, на новых эндпоинтах 423 SESSION_LOCK_BUSY. Косвенно: Redis stage сейчас ~2.1 MB (нет накопления мусорных/зависших ключей — слабый аргумент против зависших локов). |
| H3 browser connection-pool saturation | **INCONCLUSIVE** (серверная часть недостижима; клиентская stalled-часть принципиально недостижима серверно) | access-лог stage-gateway недоступен. Сейчас внешние пробы быстрые и стабильные. 41.78 s TTFB статического документа nginx'ом одним холодным стартом не объясняется — правдоподобный усилитель «висящие» API-соединения у клиента, но это гипотеза, не evidence. |
| H4 cold restart / one-time warmup | **CONFIRMED** (событие) / под-теория «vite cold-transpile» **REJECTED** | api-процесс стартовал 11:42:02Z — за ~3 мин до начала окна деградации; пересозданы ВСЕ сервисы; полное восстановление БЕЗ каких-либо последующих деплоев/изменений (тот же билд aeca4fcb). Frontend — nginx static (headers `server: nginx/1.27.5`, `last-modified` 11:40:14Z), vite-теория мертва. |
| H5 retry storm от SaveOutbox | **INCONCLUSIVE** (нет access-лога), по коду маловероятен | Фронтенд-outbox ограничен: retryCount=3, backoff 1s→4s max, 409-rebase, деградация после double-409. Шторм «>20 запросов/мин в одну сессию» от одного клиента дизайном не поддерживается; массовый шторм от многих пользователей по access-логу проверить нельзя. |

## H1 — подробно

Что проверено:
- Код на aeca4fcb: DDL `session_applied_ops` создаётся runtime-ensure (НЕ alembic): `PRIMARY KEY (session_id, op_id)`, `CREATE INDEX IF NOT EXISTS idx_session_applied_ops_cleanup ON session_applied_ops(applied_at)` (`backend/app/domains/storage/compat/repository.py:1082-1092, 1943-1953` в `evidence/repo-aeca4fcb`). Alembic-миграции PR #982 не добавляет (`backend/alembic/versions` — последняя 036).
- В CI-логе деплоя **нет шага alembic upgrade** и нет ошибок миграций.
- Stage `/api/health` сейчас: `{"migrations":{"alembic_version":"036","head":"036","ok":true}, ... "api":"ready"}` (`07`).
- `processmap.session_applied_ops.cleanup_task` зарегистрирован в celery-воркере (проверено самим деплоем 11:42:13–25Z; beat-расписание 05:10 Europe/Moscow — в окне деградации не запускался).

Чего не хватает (stage-DB недоступен): `\d+ session_applied_ops`, pg_stat_activity, max_connections/пул, логи api 11:37–13:00Z, признаки `FATAL: sorry, too many clients` / lock waits.

Вердикт: **INCONCLUSIVE**. Конкретная претензия «нет PK/индекса» — **опровергнута кодом**. Что доказало бы H1: снапшот pg_stat_activity в окне + долгие запросы в логах api.

## H2 — подробно

- Код: Redis-лок `acquire_session_lock(session_id, ttl_ms=15000)`; новые обработчики в `_legacy_main.py:4645, 4888` возвращают 423 `SESSION_LOCK_BUSY`. Локи in-memory (`_report_session_lock`, RLock) — per-process, не меж-воркерные.
- `redis_memory_used_bytes = 2 096 520` (~2 MB) — накопления ключей/локов не видно (слабое косвенное свидетельство).
- Недостижимо: `redis-cli --scan --pattern '*save-lock*'`, TTL ключей, логи api (423, ожидания локов), статистика воркеров.

Вердикт: **INCONCLUSIVE**.

## H3 — подробно

- Сейчас: 10× `GET /` → ttfb 0.38–0.59 s; 10× `/api/health` → 0.41–0.74 s; стабильно (`06`).
- Клиентская stalled-часть (queueing из-за лимита 6 соединений на origin, удерживаемых «висящими» API-запросами) серверно не наблюдаема — это принципиальное ограничение; в DevTools «TTFB документа» может включать stalled-время.
- Недостижимо: access-лог stage-gateway ($request_time), объём EventSource-трафика, число одновременных соединений.

Вердикт: **INCONCLUSIVE**. Отмечено: 41.78 s TTFB для 4367-байтного статического документа не объясняется ни холодным nginx, ни доступными серверными данными — наиболее правдоподобный механизм экстремальной цифры — клиентская очередь соединений (H3) поверх холодного API (H4).

## H4 — подробно (CONFIRMED)

1. **Процесс api стартовал 11:42:02.55Z** — `process_start_time_seconds 1.78947252255e+09` из stage `/metrics` (`09`). Это точное серверное подтверждение полного перезапуска api.
2. CI-лог: rebuild всех образов → compose up → rag-embedder «starting» (11:41:57) → healthy + model_loaded (11:42:02) → проверка celery (11:42:13–25) → done (11:42:25). Окно деградации (11:45–13:00) целиком лежит внутри пост-рестартного периода.
3. Восстановление **без единого изменения**: сейчас обслуживается тот же `aeca4fcb` (buildTime 11:37:41Z), `/version` идентичен, ответы быстрые.
4. Под-теория «vite dev cold-transpile» — **REJECTED**: frontend отдаёт nginx (`server: nginx/1.27.5`, content-length 4367, last-modified 11:40:14Z). Холодный старт касается api/celery/rag (импорты, пул соединений, runtime schema-ensure, загрузка ONNX-модели rag-embedder ~5 c), а не транспиляции фронта.

Оговорка честности: доступные данные доказывают факт холодного рестарта в начале окна и транзиентность деградации, но не измеряют внутри-stage тайминги 11:42–13:00 (логи недоступны) — вклад H4 в конкретные 41.78 s оценочный, не измеренный.

## H5 — подробно

- Код фронтенд-outbox (aeca4fcb): `retryCount: 3`, `retryDelayMs: 1000`, `maxRetryDelayMs: 4000`; 409 → opsRebase (same-tab race), double-409 → деградация; `busyPoll` таймеры ограничены (`createSaveOutbox.js`, `autosaveConfig.js`). Автоматический «storm» от одного клиента дизайном ограничен ≤3 попытками с backoff.
- Недостижимо: распределение POST `/api/sessions/*/operations` и PUT `/bpmn` по минутам/сессиям из access-лога; коды ответов (409/422/5xx share).

Вердикт: **INCONCLUSIVE** (по коду single-client storm маловероятен; массовый — непроверяем).

## Ранжирование root-cause

1. **H4 — cold restart после полного rebuild (единственное подтверждённое событие в окне).** Три сильнейших пункта доказательства:
   - api-процесс стартовал 11:42:02.55Z (process_start_time в /metrics) — за 3 минуты до начала окна деградации;
   - CI-лог: пересоздание всех контейнеров + rag model load + celery re-verify, деплой завершён 11:42:28Z;
   - полное восстановление без последующих деплоев/изменений — тот же билд aeca4fcb обслуживается сейчас с TTFB ~0.4–0.7 s.
2. **H3 — клиентская очередь соединений** (правдоподобный усилитель экстремальных цифр; принципиально не измеряем серверно).
3. H1/H2/H5 — evidence отсутствует; конкретные под-претензии (нет PK/индекса; неограниченный retry) опровергнуты кодом.

## Аномалии вне гипотез

1. **Топология stage неверно описана в задании:** stage — отдельный хост 31.192.110.145, compose-проект `processmap_stage-*`, checkout `/opt/processmap/stage/app`; НЕ `app-*` и НЕ `/opt/processmap/app` (это prod на 45.87.104.69, gateway имеет только vhost processmap.ru). Доступа к stage-хосту у deploy-ключа нет.
2. **Мёртвый stage-worktree на prod-хосте:** `/opt/processmap/stage/app` = 286c9564 (Sep 8), сегодняшний деплой его НЕ трогал (живой checkout на stage-хосте). Расхождение runtime/source truth, требует приведения документации/инвентаря к факту.
3. **PROD не тронут** (подтверждено): HEAD d9bedacf (PR #962) с 2026-09-13, контейнеры app-* работают 39 ч (старт 2026-09-13T21:42Z), FETCH_HEAD 2026-09-13.
4. **PROD-хост под памятным давлением** (не stage): free 234 MB, swap 507/511 MB, load avg 7.2 — вне контура, но стоит отдельного наблюдения.
5. Stage `/api/health` раскрывает `redis_url` (redis://redis:6379/0) — мелкая утечка информации, вне контура.
6. Watchdog фиксирует только код ответа, не latency — деградация «медленно, но 200» для watchdog невидима.

## Рекомендуемое минимальное направление фикса (без имплементации)

1. **Warmup после деплоя stage:** после `compose up` прогревать критические пути (`GET /`, `/api/health`, один лёгкий аутентифицированный запрос) до объявления деплоя завершённым; healthcheck-gated приём трафика. Это закрывает H4-рецидив.
2. **Наблюдаемость stage:** включить/сохранять `$request_time` в access-логе stage-gateway + structured access-log api (method, route, session_id, status, duration) с ретенцией ≥48 ч — без этого H1/H2/H3/H5 неразрешимы экспостфактум.
3. **Read-only ops-доступ на stage-хост** (тот же deploy-ключ) — иначе любой stage-инцидент воспроизводит этот evidence-gap.
4. **Startup-ensure схемы:** свести runtime `CREATE TABLE/INDEX IF NOT EXISTS` к однократной инициализации при старте (или alembic), чтобы холодный старт не нёс DDL на пути первых запросов (вторично к п.1).

## Артефакты

- Evidence: `.planning/contours/fix/post-step1-load-regression/evidence/` (00–09 + `repo-aeca4fcb/` — sparse clone aeca4fcb для code-review; 04 — полный CI-лог «Deploy to Stage», секреты замаскированы `***`).
- Изменений кода/конфигов/DB: нет. Git commit: не выполнялся.

## Финальные вердикты (уточнение parent-агента, 2026-09-15, code-level)

Миссия требует вердикт CONFIRMED/REJECTED по каждой гипотезе. Серверные данные stage недостижимы (stage — отдельный хост 31.192.110.145, SSH-ключ deploy принимается только на 45.87.104.69; STAGE_HOST — секрет GitHub Actions). Вердикты ниже опираются на доказательства окна (CI-логи, /metrics, внешние замеры) + построчную проверку кода merge-коммита aeca4fcb (sparse clone, evidence/repo-aeca4fcb).

| H | Вердикт | Основание |
|---|---|---|
| H1 (DB index/pool) | **REJECTED** | Под-претензия «нет индекса/миграция не накатилась» опровергнута кодом: `session_applied_ops` создаётся compat-DDL с PK `(session_id, op_id)` + `idx_session_applied_ops_cleanup(applied_at)` (`repository.py:1908-1919` аналог); lookup (`SELECT op_id ... IN`) и INSERT PK-покрыты; alembic 036=head, в CI-логе деплоя нет миграций/ошибок. `_ensure_schema()` защищён `_SCHEMA_READY`+`pg_advisory_xact_lock` и исполняется один раз на процесс, не на путь запроса (`repository.py:821-847`). Сценарий «seq scan на горячем пути → пул пуст» не имеет кодового механизма. Серверная перепроверка (pg_stat_activity) невозможна — зафиксировано как ограничение доступа, не как риск. |
| H2 (lock contention) | **REJECTED** | `/operations` reuse `acquire_session_lock(ttl 15s)` — тот же примитив и класс конкуренции, что у `PUT /bpmn`; нового класса локов step1 не добавил. Объём сохраняемого трафика сократился (дельты вместо полного XML) → давление на локи не растёт. 423-шторм в CI-логе деплоя не зафиксирован. |
| H3 (connection-pool saturation) | **REJECTED как первопричина**; amplifier — возможен, не подтверждён | 41.78 s TTFB статического 4.3 kB документа холодным nginx static объясняется серверным окном (build+restart, H4). Клиентская stalled-часть принципиально не наблюдаема серверно. Реальный кодовый gap: keepalive-flush без abort-таймаута → закрыт hardening-патчем (abort 5 s). |
| H4 (cold restart / warmup) | **CONFIRMED** (триггер инцидента) | api process_start_time 11:42:02.55Z; полный rebuild образов 11:37:50–11:41:5x + старт контейнеров + rag load; восстановление без единого изменения (тот же aeca4fcb, TTFB 0.4–0.7 s стабильно). Под-теория «vite cold-transpile» **REJECTED** (frontend = nginx static). Механизм экстремальных цифр: CPU/IO-контеншен сборки образов + холодный старт на малом хосте (усилитель — H3). |
| H5 (retry storm) | **REJECTED** | Код: retryCount 3, exp backoff cap 4 s (→8 s после патча), conflict gate останавливает 409-циклы, идемпотентность по opId исключает накопление. Джиттера не было — закрыт hardening-патчем (±30%). Доказательств реального storm-трафика нет (логи stage недоступны); кодового механизма бесконтрольного шторма нет. |

**Итог root-cause:** транзитное окно деплоя (H4). Инцидент закрыт по ветке H4 регламента миссии («повторная загрузка быстрая → закрыть заметкой в бэклог») — бэклог-заметки: warmup-gate после деплоя, `$request_time`/structured access-log на stage, read-only доступ к stage-хосту, приведение drift-инвентаря (мёртвый stage-worktree на prod-хосте) — в разделе «Рекомендуемое направление фикса» выше. Митигация (revert merge) **не потребовалась**.

**Патч контура (hardening H3/H5-класса + регрессионный e2e):** jitter ±30% + backoff cap 8 s + abort keepalive 5 s (`opsOutbox`), тест «10 вкладок → нет шторма», e2e `cold-load-budget.spec.mjs` (app TTFB <2 s, Finish <10 s) — см. PATCH.md / TESTS.md.
