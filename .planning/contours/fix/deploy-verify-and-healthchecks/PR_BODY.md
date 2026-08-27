## Что исправляет

После деплоя prod на 9d99e8ae наблюдались ложные сигналы проверки состояния и несогласованность конфигурации:

1. **verify-deploy.sh** сравнивал короткий SHA рабочей копии с полным SHA из /version.json, из-за чего всегда возвращал FAIL.
2. Скрипт хардкодил имя compose-проекта `processmap_v1`, в то время как прод использует проект `app` (контейнер `app-agent-1`).
3. Отсутствие сервиса `agent` в активном compose-стеке трактовалось как FAIL; теперь — WARN.
4. **celery-worker** был unhealthy, потому что healthcheck-эндпоинт возвращал не-JSON. Заменён на `celery inspect ping`.
5. **agent service** не имел endpoint `/version`, хотя nginx проксировал `/agent/version` — добавлен endpoint с форматом, совместимым с backend `/version`.
6. **agent memory worker** спамил warning `BRPOP failed: Timeout reading from socket`; long-poll timeout теперь логируется на уровне debug.

## Изменения

- `verify-deploy.sh`: нормализация SHA, автоопределение compose-проекта, корректная обработка отсутствующего agent-сервиса, возможность unit-тестирования.
- `scripts/tests/test_verify_deploy.sh`: 9 тестов.
- `docker-compose.yml`: healthcheck для `celery-worker` через `celery inspect ping`.
- `scripts/tests/test_compose_healthchecks.py`: smoke-тест compose.
- `backend/services/agent/routers/health.py`: `/version` в формате монолита.
- `backend/services/agent/memory/schema_memory.py`: `RedisTimeoutError` -> debug.
- Обновлены/добавлены тесты `test_health.py`, `test_memory_worker.py`.

## Чек-лист проверок

- [ ] `bash scripts/tests/test_verify_deploy.sh` — 9 passed.
- [ ] `python3.11 -m pytest backend/services/agent/tests/test_health.py backend/services/agent/tests/test_memory_worker.py scripts/tests/test_compose_healthchecks.py -q` — все passed.
- [ ] На целевом сервере: `docker ps` — `app-celery-worker-1` healthy.
- [ ] `curl https://processmap.ru/agent/version` — 200, поля `commit`/`sha`/`buildTime`/`builtAt`.
- [ ] `./verify-deploy.sh` в `/opt/processmap/app` печатает `MATCH`.
- [ ] `curl https://processmap.ru/api/health` — 200.
- [ ] `curl https://processmap.ru/agent/health` — 200.

## Rollback

- Откатить merge commit: `git revert <merge-commit-sha>`.
- Или переключить runtime обратно на `9d99e8ae` в `/opt/processmap/app` и перезапустить compose.
- Drift `/home/deploy/app` (HEAD 1b610d9) не трогать — он вне prod runtime; ликвидировать отдельным ops-контуром после проверки configs.

## Примечания

- На сервере ничего не менялось; изменения только в репозитории.
- Выполнение merge/deploy — только после явного approve.
- Артефакты планирования: `.planning/contours/fix/deploy-verify-and-healthchecks/`.
