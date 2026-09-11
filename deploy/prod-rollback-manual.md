# Ручной откат prod ProcessMap (runbook)

> Статус: заменяет workflow `.github/workflows/rollback-prod.yml` (deprecated, см. шапку workflow).
> Основание: аудит PROD 2026-09-10, PLAN-4 §1.5 и «План отката» §2.
> Инструмент отката кода: `/opt/processmap/bin/processmap-rollback-manual.sh` на сервере `deploy@45.87.104.69`.
> **Каждый шаг — только после отдельного approve владельца. Само окно отката не открывается этим документом.**

## Контекст (факты)

- Фактически served-код до окна деплоя: `30a716ca118f514267efdf2ee8ed748ded3e3dfc` (образы api/celery/worker Sep 5).
- Текущие образы `app-*:rollback` — протухшие (Sep 4, эпоха `aed51653`) — **не использовать**.
- `PREVIOUS_BUILD_ID=2ffc5cbe` в prod.env — коммит, который никогда не деплоился — **не использовать**.
- Страховочные метки `app-*:predeploy-<TS>` создаются в окне деплоя (PLAN-4 шаг 2) до dispatch и являются единственной достоверной точкой «как было».

## Шаг 1 — Данные (только если нужен полный возврат данных)

Миграции `032→036` идемпотентны и обратимо-совместимы — **откат кода БЕЗ даунгрейда БД** — базовый сценарий, этот шаг пропускается.

Если нужен полный возврат данных: restore из дампа окна деплоя:

```bash
ssh deploy@45.87.104.69
gunzip -c /opt/processmap/backups/pre_deploy_<TS>.dump.gz | docker exec -i app-postgres-1 psql -U fpc -d processmap
```

Время restore — по размеру дампа (~сотни MB), планировать заранее. **Approve отдельный.**

## Шаг 2 — Код/образы (базовый откат)

```bash
ssh deploy@45.87.104.69
/opt/processmap/bin/processmap-rollback-manual.sh --check --ts <TS>   # все 5 образов на месте
/opt/processmap/bin/processmap-rollback-manual.sh --apply  --ts <TS>  # retag + recreate + проверка
```

Скрипт: retag `app-$s:predeploy-<TS> → app-$s:latest` для api/celery-worker/agent/notifications/frontend, recreate через актуальный compose-набор (`docker-compose.yml + docker-compose.prod.yml + docker-compose.prod.standalone-gateway.yml`, `--env-file /opt/processmap/env/prod.env`, `-p app`), затем проверка `https://processmap.ru/version` и `/api/health` с хоста.

Gateway этот откат не трогает (standalone-gateway с pinned nginx не менялся). Если gateway тоже требует возврата: `docker tag processmap-gateway:dev processmap-gateway:predeploy-<TS>` делался в шаге 2 окна; возврат — отдельным approve и recreate gateway.

**Approve отдельный.** После: сверить `/version` (commit должен соответствовать `30a716ca…`) и наблюдать `docker logs app-api-1 -f`.

## Шаг 3 — Checkout (только если mounted-код участвует)

```bash
ssh deploy@45.87.104.69
cd /opt/processmap/app && git checkout -f 30a716ca118f514267efdf2ee8ed748ded3e3dfc
```

Нужен только если деплойный runtime исполняет код из монтированного дерева (после деплоя образы self-contained; celery не монтирует). **Approve отдельный.**

## Критерий завершения отката

- `curl -s https://processmap.ru/api/health` → `status: ok`, HTTP 200.
- `/version` → commit ожидаемого (predeploy) состояния.
- `docker ps` — все контейнеры `app-*` running, gateway на `nginx:1.27-alpine`.
- Владелец подтвердил работу продукта через UI.

## После отката

- Зафиксировать в prod.env корректный `PREVIOUS_BUILD_ID` (фактически предшествовавший деплоенный SHA).
- Разобрать причину провала окна деплоя до следующей попытки (не переоткрывать окно вслепую).
