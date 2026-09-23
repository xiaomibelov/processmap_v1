# RECON_PROD — read-only рекогносцировка прода (2026-09-23)

Хост: 45.87.104.69 (deploy@, ключ kimi_prod_deploy_ci). Прод не менялся — все
команды read-only (единственное исключение: throwaway-контейнер `exectest_probe`
alpine на 30 с с немедленным удалением — диагностика docker exec).

## 1. Контейнеры (docker ps -a)

- `app-celery-beat-1` — **ОТСУТСТВУЕТ** (ни running, ни stopped). **Дефект 2 активен.**
- Остальные: api, agent, celery-worker, frontend, gateway, kanboard,
  notifications, postgres, redis, rag-embedder — Up 39 hours.
- **ВСЕ контейнеры (кроме rag-embedder, Up 8h) — статус `unhealthy`** при том,
  что прод работает (HTTP 200). Причина — см. п. 7: healthcheck'и не могут
  выполниться из-за сломанного docker exec на текущем наборе контейнеров.
- `portainer_agent` — отдельно, не в контуре.

## 2. Gateway: конфиг на хосте vs репо

- Смонтирован bind: `/opt/processmap/app/deploy/prod-gateway/nginx.conf`
  → `/etc/nginx/conf.d/default.conf` (ro) — **совпадает с репо-файлом**
  `deploy/prod-gateway/nginx.conf`.
- `nginx.conf:36` — `resolver 127.0.0.11 ipv6=off valid=30s;`
- `nginx.conf:42` — `proxy_pass http://frontend:80;` — **СТАТИЧЕСКИЙ**.
  **Дефект 1 подтверждён в боевом конфиге.** Единственный upstream gateway'я
  (location / → frontend; /api проксирует frontend-контейнер).
- Сейчас НЕ активен: gateway (39h) и frontend (39h) пересоздавались вместе
  20.09 → nginx резолвнул актуальный IP. Триггер — любой recreate frontend
  без recreate/reload gateway'я (в т.ч. watchdog, см. п. 8).

## 3. Сети

- `app_default`: api 172.18.0.8, frontend 172.18.0.10, gateway 172.18.0.11,
  postgres 172.18.0.6, redis 172.18.0.4, остальные — в диапазоне .2–.9.
- `processmap_edge_net` (external, EDGE_NETWORK_NAME): frontend 172.19.0.2,
  gateway 172.19.0.3.
- Имени `edge_shared` в docker network ls НЕТ — актуальные имена `app_default`
  (project) и `processmap_edge_net` (external). docker-compose.prod.yml
  требует `EDGE_NETWORK_NAME` из env.
- Какой IP резолвит gateway изнутри — не проверено (docker exec в gateway
  сломан, см. п. 7); по косвенным данным (prod работает) — актуальный.

## 4. Диск и БД

- `df -h`: / 79G, занято 49G, **свободно 27G (65%)** — под бэкап (~1G) и
  образы достаточно.
- Размер БД изнутри postgres получить не удалось (docker exec сломан,
  psql-клиента на хосте нет). Оценка по дампам: ~1–3 GB (дампы Fc ~1 GB).
- Бэкапы `/opt/processmap/data/prod/backups/`:
  - `pre-pipeline-20260920001130.dump` — 998M, **последний** (окно деплоя
    2c051887 20.09). `pg_restore --list` через throwaway-контейнер
    postgres:16-alpine: **OK, 451 TOC entries, валидный архив**.
  - 6 более старых дампов (Sep 13–20), включая `pre-deploy-d9bedacf…` 1.2G.
- `docker system df`: образы 6.9G (reclaimable 1.4G), контейнеры 1.2G,
  volumes 420kB.

## 5. Predeploy-теги и ENV

- `docker images | grep predeploy`: теги `predeploy-20260920001130` есть для
  api / celery-worker / agent / frontend (и двух окон 13.09). TS последнего
  окна = окну деплоя BUILD_ID — консистентно.
- `/opt/processmap/env/prod.env`: `BUILD_ID=2c051887…` (== задеплоенный SHA),
  `PREVIOUS_BUILD_ID=d9bedacf…`. Консистентно с фактом.

## 6. Прочее

- crontab: certbot-renew.sh — **есть** (4:23 daily), availability-watchdog
  каждые 30 мин, docker-cleanup 4:30.
- Docker Compose **v5.1.4** (свежая мажорная линия — см. риск в п. 7).
- Docker-образ postgres:16-alpine присутствует локально (sidecar-паттерн
  для бэкапа возможен без pull).

## 7. 🔴 КРИТИЧНО: docker exec сломан на текущем наборе контейнеров

- Симптом: `docker exec app-*-1 …` →
  `OCI runtime exec failed: … SetSSB requires libseccomp >= 2.5.0 and API
  level >= 4 (current version: 2.5.5, API level: 1)`.
- Проверено на postgres/gateway — воспроизводится; healthcheck'и всех
  старых контейнеров из-за этого `unhealthy`.
- **В свежесозданном контейнере (alpine, probe) docker exec работает** —
  контейнер создался, exec OK, удалён. Значит дефект привязан к старым
  контейнерам (созданным 39ч назад, до изменения daemon/libseccomp-профиля),
  а не к хосту целиком.
- Последствие для деплоя **сейчас** (deploy-prod.yml идёт по шагам):
  1. `prod_preflight_gates.sh` (gates-job, ДО изменений): alembic heads через
     `docker exec app-api-1` → **deploy блокирован уже на гейтах**.
  2. Бэкап БД: pg_dump через `docker exec -d app-postgres-1` → упал бы
     следующим шагом.
  3. `nginx -t` post-up — **не сломан**: gateway пересоздаётся в up-списке,
     exec в свежем контейнере работает.
- Вывод: без правок репо прод-деплой СЕЙЧАС невозможен. Host-side fix
  (libseccomp/профиль) — за пределами read-only контура; repo-side fix —
  sidecar-паттерн `docker run --rm` (backup, preflight) — в PR части 1.

## 8. Watchdog — активный триггер дефекта 1

`/opt/processmap/bin/processmap-availability-watchdog.sh` (cron */30):
- Проверяет URL (processmap.ru + stage); при недоступности делает
  `compose up -d --no-deps <service>` для api/gateway/frontend/celery-worker.
- Если пересоздаёт **только frontend** (новый IP) без reload gateway →
  ровно stage-инцидент 23.09 (#1030) на проде, в любой момент.
- Скрипт вне репо (лежит на хосте) — правка watchdog'а = отдельное решение
  владельца; в репо закрываем deploy-путь (reload + пост-проверка маршрутизации).

## Выводы: что из дефектов активно прямо сейчас

| Дефект | Статус |
|---|---|
| Дефект 1 (статический proxy_pass, stale upstream) | Конфиг подтверждён; мгновенно не активен, но триггер (watchdog recreate) живёт в cron |
| Дефект 2 (celery-beat отсутствует) | **Активен**: контейнера нет, витрина canvas_event_read на проде не строится |
| Дефект 3 (найден реконом): docker exec сломан | **Активен, блокирует любой прод-деплой** (preflight + backup) |
