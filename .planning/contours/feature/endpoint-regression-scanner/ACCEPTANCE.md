# ACCEPTANCE — feature/endpoint-regression-scanner

Дата: 2026-08-19. Стенд: локальный docker-стек `pm_epscan` из worktree
`p0-work-worktrees/feat-endpoint-regression-scanner` (HEAD `e462d99dfd28857bc4f3963361d623f0834c9f5f`).
Работающий стек `processmap_v1-*` не трогали. Коммитов не было.

## 0. Окружение / изоляция

- `.env` создан из `.env.example`: `COMPOSE_PROJECT_NAME=pm_epscan` (compose v2 читает имя из .env,
  подтверждено `docker compose config` → `name: pm_epscan`), `HOST_PORT=8211`, `FRONTEND_PORT=5277`,
  `POSTGRES_PORT=5444`, `REDIS_PORT=6389`, `NOTIFICATIONS_HOST_PORT=8018` (все проверены на свободность),
  свежие `JWT_SECRET` и `ENDPOINT_CHECK_DEPLOY_TOKEN` (openssl rand), `DEV_SEED_ADMIN=1`,
  `ADMIN_EMAIL=admin@local` / `ADMIN_PASSWORD=<локальный стенд, не коммитим>`, `ENDPOINT_CHECK_RUN_ON_DEPLOY=1`.
- **Найдено:** `.env` в этом репозитории **трекался в git** (`git ls-files` находит его, поэтому
  `git check-ignore` молчит, хотя `.gitignore:37-38` содержит `.env`/`.env.*`). Секреты остались только
  локально, ничего не закоммичено; стоит убрать `.env` из индекса отдельным контуром.
- Подъём: `docker compose up -d --build` с build-args (`BUILD_ID=$(git rev-parse HEAD)` и т.д.).
  Все 8 контейнеров healthy.

### intended == served

`GET http://localhost:8211/version` →
`{"commit":"e462d99d...c9f5f","branch":"feature/endpoint-regression-scanner","env":"local-acceptance"}` —
совпадает с `git rev-parse HEAD` worktree. Frontend `http://localhost:5277/` → 200.

### Отклонение окружения (не фича, зафиксировано)

На полностью пустом postgres `db_bootstrap` падает: baseline по маркерам пустой → `alembic upgrade`
с нуля → миграция `001` (`ALTER users ADD role`) падает (`relation "users" does not exist`),
entrypoint уходит в degraded-старт без справочных сидов. Ручной ремонт (только БД стенда, код не трогали):
`ALTER TABLE users ADD COLUMN role ... + CREATE INDEX idx_users_role` (точно по миграции 001), затем
`python backend/scripts/db_bootstrap.py` в контейнере → `OK — база на head`, restart api → справочные
сиды отработали. **Follow-up:** fresh-postgres bootstrap сломан апстримом — завести дефект.

Также: `/api/health` сообщает `migrations: {alembic_version: "025", head: "016", ok: false}` —
похоже, ожидаемый head в health-чеке захардкожен/устарел (реальный head цепочки — 025). Зафиксировано,
вне контура.

## 1. Smoke API — PASS

- `POST /api/auth/login` (admin@local) → access_token.
- `POST /api/admin/endpoint-check/run` (bearer) → **202** `{"run_id":"ecr_68dd7d732ff747c6a006f1ca","trigger":"manual"}`.
- Повторный POST во время прогона → **409** `{"detail":"scan_already_running","run_id":...}`.
- `GET /status` во время прогона → `active.progress` (`30/99`, …).
- Прогон №1 (ещё до ремонта БД): `scanned=99, ok=68, http_error=31 (5xx=17), domain_error=0, timeout=0`,
  diff `new_endpoint=99`. 5xx — ровно справочные/LLM-эндпоинты без таблиц (см. отклонение выше).
- Прогон №2 (после ремонта БД, baseline): `ok=85, http_error=14, 5xx=0, timeout=0`,
  diff `{ok:68, still_failing:14, fixed:17}` — 17 починившихся = ровно те 17 бывших 5xx.
  Оставшиеся 14 http_error — 4xx (авторизация/404), без 5xx.

Файлы: `run1.json`/`run1_detail.json`, `run2.json`/`run2_detail.json`, `status_run1_done.json`,
`runs_after_run1.json`.

## 2. Ловля регрессии — PASS

- backend смонтирован в api (`./backend:/app/backend` в compose) — правка подхватывается рестартом.
- В `backend/app/routers/version.py` добавлен `raise RuntimeError("intentional regression test")`
  в начало обработчика `/version`; `docker compose restart api`; `/version` → 500, `/api/health` → 200.
- Прогон №3 (`ecr_a80fe1be50bc49a48584f350`): counts `ok=84, http_error=15, 5xx=1`,
  diff `{ok:84, still_failing:14, new_error:1}`. Единственный `new_error`:
  `GET /version`, `http_status=500`, `note="было: ok 200"`, `body_excerpt={"detail":"internal_server_error",...}`,
  `error_events=[Unhandled backend exception: RuntimeError, ...]`.
- Доказательство: `run3_detail.json`.

## 3. Откат → fixed — PASS

- `git checkout -- backend/app/routers/version.py` (история не тронута), restart api, `/version` → 200.
- Прогон №4 (`ecr_f573f398f08d4040ad43edc5`): counts `ok=85, 5xx=0`,
  diff `{ok:84, still_failing:14, fixed:1}`. Строка `/version`: `http_status=200, category=ok,
  diff_status=fixed, note="было: http_error 500"`.
- Доказательство: `run4_detail.json`.

## 4. Deploy-trigger (X-Deploy-Token) — PASS

- `POST /api/admin/endpoint-check/run -H "X-Deploy-Token: <token>"` → **202**
  `{"run_id":"ecr_0a6329474d1543879f37a727","status":"pending","trigger":"deploy"}` (без bearer).
- Немедленный повтор → **202** `{"...","debounced":true}` с **тем же run_id** (дебаунс в окне
  отложенного старта; 409 — только для уже выполняющегося прогона, проверено в шаге 1).
- Отложенный старт: POST в 20:46:46.8Z, первый запрос сканера в логах api 20:47:37Z → ~50с
  (задержка 45с + оверхед планировщика), finish 20:47:56Z.
- `GET /runs/{id}`: `trigger=deploy`, `version.commit=e462d99d...`, counts `ok=85, 5xx=0`.
- Доказательства: `run5_deploy.json`, `run5_deploy_debounce.json`, `run5_deploy_detail.json`,
  `runs_final.json` (5 прогонов, хронология воспроизводится).

## 5. UI (playwright, chromium) — PASS

Вход seeded admin, `/admin/dashboard` на `http://localhost:5277`. Карточка видна при админском праве
(`canOpenApiDocs`). Скриншоты в `shots/`:

- `01_card_summary_new_error.png` — карточка «Проверка эндпоинтов» со сводкой
  «84 ok · 1 новых ошибок · 14 всё ещё падают · 0 починились», триггер/коммит/ветка.
- `02_badge_new_errors.png` — красный бейдж «Новые ошибки 1» (во время new_error).
- `03_results_table_filter_new.png` — таблица, дефолтный фильтр «Новые · 1»: `GET /version`, «новая ошибка», ok → 500.
- `04_drilldown_version_500.png` — drill-down: note «было: ok 200», тело ответа, связанные error-events (RuntimeError, fingerprint, request_id).
- `05_dashboard_full.png` — весь дашборд.
- `06_card_after_fixed_no_badge.png` — после fixed-прогона бейдж отсутствует (проверено и программно: badge count = 0).

## 6. Итог

Все пункты приёмки — **PASS**. Финальное состояние: 5 прогонов в `/runs`, последний deploy-прогон зелёный
(85 ok / 0 5xx / 0 timeout). Дерево worktree: `version.py` возвращён в исходное состояние
(`git status` показывает только изменения самой фичи + `.env`), коммитов не делалось.
Стек `pm_epscan` оставлен поднятым (порты 8211/5277/5444/6389/8018/3001).

### Открытые follow-up (вне контура фичи)

1. Fresh-postgres bootstrap: `db_bootstrap` не умеет поднимать базу с нуля (миграция 001 требует
   существующий `users`). Нужен дефект/фикс (baseline-schema или stamp-путь для пустой БД).
2. `/api/health.migrations.head="016"` при реальном head 025 — устаревшая константа в health-чеке.
3. `.env` трекается в git (игнор правилами `.gitignore` не действует на tracked-файл).
