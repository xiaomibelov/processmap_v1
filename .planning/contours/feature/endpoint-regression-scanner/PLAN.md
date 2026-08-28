> DEPRECATED: упоминания clearvestnic.ru в этом документе — исторические. Домен выведен из проекта. Prod = processmap.ru, stage = stage.processmap.ru.

# PLAN — feature/endpoint-regression-scanner

Регрессионный сканер эндпоинтов: кнопка в админке + автозапуск после деплоя →
прогон всех read-only эндпоинтов живого приложения → таблица с диффом против
прошлого прогона. Без PR с тестами наружу, без GitHub API — всё внутри приложения.

## Источники правды

- Живая спека: `GET /api/openapi.json` (роутер `backend/app/routers/api_docs.py`,
  право = как у кнопки «API Docs»: `API_DOCS_ROLES` / `is_admin`).
- Исключения деструктивных операций: `backend/tests/contract/exclusions.yaml`
  (method_policy GET-only, skip_operations, domain_error_envelope_operations,
  spec_gap_*) — парсятся через `yaml.safe_load`, как `contract_support.py`.
- Маппинг имён реальных id: `contract_support.py:get_context()`
  (`seeded_path_params`/`seeded_query_params`). Значения — из живого API
  (list-эндпоинты), не seed.
- Error-events: `backend/app/error_events/`, таблица `error_events`,
  API чтения `GET /api/admin/error-events[/{id}]`.
- Админ-право: `_admin_context`/`_platform_admin_context` в
  `backend/app/routers/admin.py` (is_admin или org-роль из `_ADMIN_ALLOWED_ROLES`).
- Версия/коммит: `GET /version` (BUILD_ID/BUILD_BRANCH из .env деплоя).
- Деплой: `deploy/deploy.sh` (healthcheck строки 89–111) — точка вставки
  автозапуска; `.github/workflows/deploy-prod.yml:143-177` — freshness proof.

## Этап 0 (сегодня, первым) — одноразовый sweep прода

- `scripts/endpoint_sweep.py` — standalone (stdlib + PyYAML), READ-ONLY:
  только GET, concurrency ≤ 2, таймаут на запрос, общий бюджет.
- Прод: `https://processmap.ru` (clearvestnic.ru недоступен — SSL dead,
  зафиксировано 2026-08-19; prod version: commit 68d4c6c2, buildTime
  2026-08-19T16:37:50Z).
- Вывод: терминал + JSON (`build/endpoint_sweep_<ts>.json`): таблица
  эндпоинт → статус/latency; итог X ok / Y HTTP-ошибок / Z доменных /
  W таймаутов; все 5xx с телом; слепая зона (мутации, исключения,
  unresolved id) — «проверить руками».
- LLM-конверты 200 {ok:false}/{error} — отдельный статус «доменная ошибка».
- Токен: env `ENDPOINT_SWEEP_TOKEN`, не печатается, не коммитится.

## Этап 1 — backend

- `backend/app/routers/admin_endpoint_check.py` + сервис.
- `POST /api/admin/endpoint-check/run` — фоновая async-задача; один активный
  прогон → 409; право админское.
- Прогон против собственного API (localhost): GET-операции, реальные id,
  exclusions, concurrency ≤ 2, таймаут, общий бюджет. Мутации — «вне
  сканирования» в отчёте.
- Хранение: `endpoint_check_runs` (started/finished, trigger, версия/коммит,
  итоги) + `endpoint_check_results` (операция, статус, latency, fingerprint
  ошибки). История не затирается.
- Дифф против прошлого прогона: new_error / still_failing / fixed / ok /
  new_endpoint (+ доменные LLM отдельно).
- `GET .../status` (прогресс активного), `GET .../runs`, `GET .../runs/{id}`.
- Связка с error-events: для упавших — последние error-events по path/времени.
- Новые admin-эндпоинты → обновить baseline спеки, проверить spec-drift.

## Этап 2 — frontend (админка, рядом с FeatureFlagsWidget)

- Карточка «Проверка эндпоинтов»: «Запустить», поллинг 5–10 сек, сводка
  последнего прогона (X ok · Y новых · Z всё ещё падают · W починились),
  trigger: manual/deploy, версия.
- Таблица результатов, дефолтный фильтр «только новые ошибки»; строка:
  метод+путь, статус был→стал, latency, время; клик → drill-down
  (тело ответа + error-events).
- Красный бейдж/счётчик при new_error — виден сразу при входе в админку.
- Видимость по админскому праву, без права — нет в DOM.

## Этап 3 — автозапуск после деплоя

- Конфиг `ENDPOINT_CHECK_RUN_ON_DEPLOY` (дефолт true на stage, выключается env).
- Триггер из деплой-пайплайна после успешного healthcheck'а:
  `curl -X POST /api/admin/endpoint-check/run` с `X-Deploy-Token`
  (env `ENDPOINT_CHECK_DEPLOY_TOKEN`, в секретах, не в репозитории).
  НЕ хуком на старт приложения.
- Эндпоинт принимает ИЛИ админскую bearer-сессию, ИЛИ deploy-токен.
- Отложенный старт 30–60 сек + дебаунс 5 минут → один прогон на серию деплоев.
  409 «scan already running» не валит деплой-шаг.
- В записях: trigger: manual|deploy + версия/коммит (version.json /
  deployment-notice).

## Безопасность

- На проде прогон только read-only, только по кнопке/деплою, ≤ 2 параллельных.
- Секреты только в env. Продакшн-код не менять вне файлов фичи.

## Тесты

- Бэк: 401/403, валидный/невалидный/отсутствующий deploy-токен, 409-дубль,
  дебаунс, дифф-логика на фейковых runs, LLM-конверты, флаг выкл.
- Фронт: видимость по праву, фильтр «новые ошибки», состояния карточки.
- Регресс: основной suite + contract suite зелёные.

## Приёмка

- Результат Этапа 0 по проду — сразу, отдельным сообщением.
- PR + отчёт: скрины карточки/таблицы/drill-down; инструкция, куда вставлен
  шаг в деплой-пайплайн (файл/строки).
- Доказательство ловли регрессий на stage: сломанный эндпоинт → new_error →
  откат → fixed.
- Демонстрация автозапуска: деплой на stage → прогон с trigger: deploy и
  версией коммита.

## Git-state на старте (2026-08-19)

- worktree: `p0-work-worktrees/feat-endpoint-regression-scanner`
- branch: `feature/endpoint-regression-scanner` от `origin/main`
- HEAD = origin/main = e462d99dfd28857bc4f3963361d623f0834c9f5f
- merge в main — только после явного подтверждения пользователя.
