# Handoff — feature/endpoint-regression-scanner (2026-08-19)

## Цель
Регрессионный сканер эндпоинтов: кнопка в админке + автозапуск после деплоя →
прогон всех read-only GET-эндпоинтов живого приложения → дифф против прошлого
прогона. Всё внутри приложения, без GitHub API.

## Что закрыто
- Этап 0: `scripts/endpoint_sweep.py` + прогон прода (processmap.ru,
  main@68d4c6c2): 5xx нет, 107 ok / 5 доменных 4xx. Прод здоров.
- Этап 1: backend — `app/endpoint_check/` (service/store/diff), роутер
  `admin_endpoint_check.py` (POST run 202/409, GET status/runs/runs/{id},
  право = API Docs), таблицы endpoint_check_runs/results, дифф-матрица,
  связка error-events, stale-recovery, self-scan token TTL > бюджета.
- Этап 2: карточка «Проверка эндпоинтов» в админке (дашборд, право
  canOpenApiDocs), поллинг 7с, красный бейдж новых ошибок, таблица
  «был→стал», drill-down с error-events, блок «Вне сканирования».
- Этап 3: deploy.sh:113-131 — автозапуск с X-Deploy-Token после healthcheck;
  флаг ENDPOINT_CHECK_RUN_ON_DEPLOY (дефолт stage), отложенный старт 45с,
  дебаунс 5 мин; в прогонах trigger: manual|deploy + версия/коммит.
- Review пройден (blocker B1 + major M1/M2 исправлены). Приёмка на отдельном
  стеке pm_epscan: new_error → fixed на намеренной поломке, deploy-trigger с
  дебаунсом, 6 скринов UI. Тесты: backend 19, frontend 32 — зелёные;
  suites без новых падений против baseline.

## Git-state
- Ветка feature/endpoint-regression-scanner, коммит 1158a60b (42 файла, +6619).
- Base e462d99d; origin/main уже e1387bc7 — перед merge актуализировать.
- Merge в main — только после явного подтверждения владельца. Push/PR не делался.

## Артефакты
.planning/contours/feature/endpoint-regression-scanner/: PLAN.md, EXEC_REPORT.md,
ACCEPTANCE.md, sweep-prod-*.json, run*.json (доказательства), shots/01-06.

## Что осталось / риски
- Push + PR + merge — по решению владельца (нужна актуализация на origin/main).
- Прод: задать ENDPOINT_CHECK_DEPLOY_TOKEN в секретах; RUN_ON_DEPLOY на проде
  по умолчанию выключен (только кнопка) — включить осознанно.
- Follow-up вне контура: fresh-pg bootstrap сломан (миграция 001), health
  сообщает migrations.head=016 при head 025, .env трекается в git,
  clearvestnic.ru мёртв (прод = processmap.ru).
- Spec-gap кандидаты из sweep прода: обязательные query-параметры
  (path_id у reports/versions, job_id у auto-pass) не задокументированы в спеке.
