# ROLLBACK AUDIT + FAST-PATH RUNBOOK — prod (2026-09-23)

Контур: fix/prod-deploy-hygiene-rollback-audit. Read-only: откат НЕ исполнялся;
на хосте выполнялся только `--check` (read-only режим скрипта).

## 1. Механизм отката (как задокументировано → как есть)

**Workflow**: `.github/workflows/rollback-prod.yml` (workflow_dispatch, input
`predeploy_ts`), environment: **prod** (approve-гейт), concurrency-group
`deploy-prod` (не отменяет running deploy — окно защищено с обеих сторон).
Делегирует хост-скрипту `/opt/processmap/bin/processmap-rollback-manual.sh`
(не в репо; аудит-версия от 2026-09-11) режимами `--check` → `--apply`.

**--check**: для 5 сервисов `api celery-worker agent notifications frontend`
обязан найти `app-<svc>:predeploy-<TS>`, иначе exit 2.
**--apply**:
1. retag `app-<svc>:predeploy-<TS>` → `app-<svc>:latest` (5 сервисов);
2. `compose -f docker-compose.yml -f docker-compose.prod.yml
   -f docker-compose.prod.standalone-gateway.yml -p app
   up -d --no-deps --force-recreate` теми же 5 сервисами;
3. sleep 10 → `curl /version` + `curl /api/health` (200 = готово, exit 0;
   иначе exit 3).
**БД не трогает** — откат данных только restore из дампа окна
(`pre-pipeline-<TS>.dump`), отдельный approve владельца. Gateway не
пересоздаётся и не трогается (standalone pinned nginx).

## 2. Сверка с реальностью хоста (read-only)

- `--check --ts 20260920001130` (последнее окно, прод 2c051887): **все 5
  predeploy-образов на месте** (api/celery-worker — одинаковый image id
  4a48313…, agent beb6327…, notifications 17f1ce6…, frontend 1b2a690…).
  TS последнего успешного окна найден, ENV консистентен
  (BUILD_ID=2c051887 == задеплоенный SHA).
- Последний дамп `pre-pipeline-20260920001130.dump` (998M): `pg_restore
  --list` валиден (451 TOC).
- docker exec в rollback-пути **не используется** → сломанный exec на хосте
  (RECON_PROD п.7) откат не блокирует.

## 3. Аддитивность миграций дельты 2c051887 → 63c7c341

- **Alembic: ноль изменений** в дельте (`git diff 2c051887..63c7c341 --
  backend/alembic` пуст).
- DDL телеметрии в коде — канонический guarded-паттерн:
  - `CREATE TABLE IF NOT EXISTS canvas_event_raw/read`
    (backend/app/domains/storage/canvas_telemetry/repository.py:45,72);
  - `ALTER TABLE … ADD COLUMN classification` под guard `_column_exists`
    (:92-99) + `CREATE INDEX IF NOT EXISTS` (:101-107);
  - BIGINT-колонки с DEFAULT 0 — без ALTER существующих типов.
- **Вывод: откат КОДА на старые образы при новых таблицах безопасен**
  (старый код новые таблицы не читает и не пишет). Блокера нет.

## 4. Найденные проблемы (по градации)

**Значимые (в runbook, правка вне репо — хост-скрипт):**
1. **Откат пересоздаёт frontend БЕЗ reload/recreate gateway** → тот же
   stale-upstream 502, что на stage 23.09. В --apply gateway не входит и HUP
   не шлётся. Обязательный ручной шаг после отката: `docker kill -s HUP
   app-gateway-1` (runbook шаг 4).
2. После внедрения celery-beat (часть 1 этого контура) откат его не
   пересоздаёт: beat останется на НОВОМ образе при откаченном api
   (scheduler-only, риск низкий, но задокументировано).

**Мелкие:**
3. В финальном сообщении --apply захардкожен «сверь commit с ожидаемым
   30a716ca…» — артефакт аудита 11.09, сейчас вводит.
4. `--check` покрывает только 5 сервисов; beat (новый) не проверяется —
   некритично, т.к. образ beat == образ worker.

## 5. Оценка времени отката end-to-end

| Шаг | Время |
|---|---|
| dispatch + approve-гейт | 1–2 мин (человек) |
| --check (5 inspect) | <10 с |
| retag + recreate 5 контейнеров (образы локальные) | 2–4 мин |
| sleep 10 + /version + /api/health | ~30 с |
| HUP gateway + проверка HTML | ~30 с |
| **Итого** | **~5–8 минут** |

Дамп 1 GB: restore (если понадобится откат ДАННЫХ) — отдельная процедура
на десятки минут + approve; в fast-path не входит.

---

## FAST-PATH RUNBOOK — «после деплоя что-то не так» (одна страница)

**Триггер**: 5xx на processmap.ru, ошибки сохранения канваса, регресс после
прод-деплоя main. Решение принимает владелец: откат vs hotfix.

### Полный откат кода (образы окна деплоя)
1. Определи TS окна: свежий `last-deploy-summary-<TS>.md` в
   `/opt/processmap/data/prod/backups/` или строка `predeploy-<TS>` в логе
   деплоя. TS последнего окна на момент аудита: **20260920001130**.
2. GitHub → Actions → **Rollback Prod** → Run workflow → `predeploy_ts=<TS>`
   → approve environment: **prod**.
3. Скрипт сам: --check (образы) → retag → recreate 5 сервисов →
   /version + /api/health.
4. **Обязательно вручную сразу после зелёного прогона** (стale-upstream):
   ```bash
   ssh deploy@45.87.104.69 'docker kill -s HUP app-gateway-1 && sleep 3 && \
     curl -sk https://127.0.0.1/ | grep -o "index-[A-Za-z0-9_-]*\.js"'
   ```
   Должен вернуться бандл, а не 502.
5. Проверь `curl -s https://processmap.ru/version` — commit == ожидаемый
   старый (сейчас: 2c051887… для окна 20260920).

### Хирургический откат (только api, когда полный избыточен)
```bash
ssh deploy@45.87.104.69 '
  docker tag app-api:predeploy-<TS> app-api:latest && \
  cd /opt/processmap/app && \
  docker compose --env-file /opt/processmap/env/prod.env \
    -f docker-compose.yml -f docker-compose.prod.yml \
    -f docker-compose.prod.standalone-gateway.yml -p app \
    up -d --no-deps --force-recreate api && \
  docker kill -s HUP app-gateway-1'
```
Когда достаточно: баг изолирован в backend, frontend/worker не тронуты.

### Критерии: откат vs hotfix
- **Откат**: массовые 5xx, потеря/порча данных, конфликтные 409 у многих
  пользователей, деградация >15 мин без понятного RCA.
- **Hotfix**: изолированная фича, понятный RCA, фикс-ветка уже готова.

### После отката (первые 15 минут)
- /version == старый SHA; / и /api/health = 200; `docker ps` — 5 сервисов up.
- Логи api на повторяющиеся ошибки: `docker logs app-api-1 --since 10m`.
- Витрина /admin/canvas-telemetry — без новых групп ошибок.
- Если откат не помог → эскалация: откат ДАННЫХ из `pre-pipeline-<TS>.dump`
  (отдельный approve, инструкция deploy/prod-rollback-manual.md).
