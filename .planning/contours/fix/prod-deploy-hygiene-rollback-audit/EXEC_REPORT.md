# EXEC-ОТЧЁТ — URGENT: предпродовая гигиена + подстраховка отката (2026-09-23)

Контур: `fix/prod-deploy-hygiene-rollback-audit`, ветка `fix/prod-deploy-hygiene`
(от origin/main 63c7c341), PR: **#1031**. Prod тронут только read-only
(+ probe-контейнер с самоудалением для диагностики docker exec).

## Итог по частям брифа

| Часть | Статус |
|---|---|
| 0 — рекогносцировка прода | ✅ RECON_PROD.md (7 разделов фактов) |
| 1 — PR гигиены | ✅ #1031 (beat + HUP/reload-гейт + sidecar backup/preflight + регрессия 8/8) |
| 2 — аудит rollback | ✅ ROLLBACK_AUDIT.md + FAST-PATH RUNBOOK (откат не исполнялся) |
| 3 — этот отчёт + чеклист 60 минут | ✅ ниже |

## Ответ на главный вопрос: можно ли деплоить прод

**Сейчас — НЕТ. После merge #1031 — ДА, с чеклистом ниже.**

Три дефекта (полный механизм — в RECON_PROD.md):
1. **docker exec сломан на прод-хосте** (libseccomp SetSSB, API level 1) —
   текущий deploy-prod.yml падал бы на preflight-гейтах и бэкапе. #1031
   переводит оба пути на sidecar `docker run --rm`. До внесения #1031 деплой
   блокирован.
2. **celery-beat отсутствует** — витрина canvas_event_read на проде пустая;
   без beat приёмка телеметрических контуров (#1022/#1023) на проде невозможна.
   #1031 добавляет beat (worker-образ, ghcr-пакета beat нет).
3. **gateway stale-upstream** — активный триггер (watchdog cron */30);
   #1031 закрывает deploy-путь (HUP + routing-гейт).

Rollback-путь исправен и проверен read-only: predeploy-образы окна
20260920001130 на месте (5/5), дамп валиден (pg_restore --list, 451 TOC),
миграции дельты аддитивны (alembic пуст, DDL guarded) → **откат кода безопасен,
~5–8 минут end-to-end** (runbook в ROLLBACK_AUDIT.md, включая обязательный
HUP gateway после отката — найденный дефект rollback-скрипта).

## Пост-деплойный чеклист — первые 60 минут после прод-деплоя main

Выполняет владелец/агент по поручению. Один проход ≈ 10 минут, повторить через
15/30/60 минут.

```bash
# 0. Деплой (dispatch workflow deploy-prod.yml, approve environment: prod)
#    — в прогоне ОБЯЗАНЫ быть зелёными: preflight gates, backup verified,
#      gateway HUP + routing check, freshness 6/6, post-gates.

# 1. Версия и HTTP (сразу после зелёного прогона)
curl -s https://processmap.ru/version          # commit == 63c7c341… (деплоенный SHA)
curl -s -o /dev/null -w '%{http_code}\n' -k https://processmap.ru/          # 200
curl -s -o /dev/null -w '%{http_code}\n' -k https://processmap.ru/api/health # 200

# 2. Контейнеры (beat жив — главное новое)
ssh deploy@45.87.104.69 'docker ps --format "{{.Names}}\t{{.Status}}" | grep app-'
#    ожидание: app-celery-beat-1 Up (healthy после первого healthcheck)

# 3. Витрина телеметрии — строится после первого цикла beat (до ~5 мин)
#    /admin/canvas-telemetry: canvas_event_read получает строки,
#    новых групп save-failure нет.

# 4. Отсутствие 5xx в логах (15 минут окно)
ssh deploy@45.87.104.69 'docker logs app-gateway-1 --since 15m 2>&1 | grep -c " 5.. " ; \
  docker logs app-api-1 --since 15m 2>&1 | tail -50 | grep -iE "error|exception" | head -5'

# 5. p95 api (~15 минут наблюдения)
ssh deploy@45.87.104.69 'docker logs app-api-1 --since 15m 2>&1 | \
  grep -oE " [0-9]+ms" | sort -n | awk "{a[NR]=\$1} END {print \"p95:\", a[int(NR*0.95)]}"'
#    (или по вашему обычному инструменту; регресс vs до деплоя недопустим)

# 6. Канвас smoke (5 минут руками): логин → открыть сессию → move тасок →
#    reload: стрелки/позиции на месте, 0 баннеров конфликтов.

# 7. Резерв на всякий случай: убедиться, что predeploy-теги окна созданы
ssh deploy@45.87.104.69 'docker images | grep predeploy | head -7'
```

**Стоп-краны (откат по runbook ROLLBACK_AUDIT.md):** массовые 5xx, потеря
данных, конфликтные 409 у пользователей, деградация >15 мин без RCA.

## Осталось владельцу (вне этого контура)

1. Merge #1031 → прод-деплой main (dispatch + approve prod).
2. Чеклист выше (60 минут после деплоя).
3. Хост-задачи (отдельные решения): libseccomp/docker-профиль (root), правка
   watchdog (HUP после recreate), косметика rollback-скрипта (30a716ca),
   возможно docker-compose v5.1.4-валидация на staging-подобном окне.
4. Approve на удаление 7 тест-сессий на stage (список — в отчёте PREMIUM/URGENT
   контура canvas, 2026-09-23).
