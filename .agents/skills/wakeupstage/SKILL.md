---
name: wakeupstage
description: Диагностика и восстановление STAGE-окружения ProcessMap (stage.processmap.ru, отдельный хост 31.192.110.145, ssh-алиас `stage`). Триггеры — "wakeupstage", "проснись stage", "проверь stage", "stage не работает", "stage.processmap.ru не отвечает". Прод (processmap.ru) не трогать вообще.
---

# wakeupstage — будильник STAGE-окружения

## Границы (обязательно, прочитать первым)

- **Разрешено:** только STAGE-окружение (отдельный хост 31.192.110.145):
  - compose-проект `processmap_stage` (контейнеры `processmap_stage-*`);
  - URL `https://stage.processmap.ru/` и его эндпоинты;
  - хостовый порт `28008` (stage notifications);
  - собственный gateway `processmap_stage-stage-gateway-1` (публикует 80/443 хоста) — stage-сущность, в границах скилла;
  - хостовые ресурсы (диск, память) — читать можно.
- **Запрещено абсолютно:** любое касание PROD (это ДРУГОЙ хост — 45.87.104.69, этот скилл туда не ходит вообще):
  - контейнеры `app-*` (включая `app-gateway-1`) — ни диагностика, ни логи, ни restart;
  - URL `https://processmap.ru` и его эндпоинты — не дергать;
  - prod compose-оверрайды (`docker-compose.prod*.yml`, `docker-compose.ssl.yml`), `.env` prod, prod `deploy/deploy.sh`.
- ВНИМАНИЕ: на prod-хосте 45.87.104.69 лежит мёртвое зеркало `processmap_stage-*` (поднято без
  postgres/redis, api unhealthy с рождения, celery/notifications в crash-loop, трафик не
  обслуживает). Это НЕ stage. Выводы о stage делать только с 31.192.110.145 и по
  https://stage.processmap.ru.
- Сомневаешься, чья сущность — не трогай и спроси пользователя.

## Регламентный старт

1. Активируй skill `processmap-agent`, затем прочитай `/opt/processmap-test/AGENTS.md`
   (локальное зеркало: `server-backup/opt/processmap-test/AGENTS.md`). Stage-хост — отдельный:
   canonical stage app dir `/opt/processmap/stage/app` (собственный checkout), НЕ путать с
   `/opt/processmap/app` на prod-хосте.
2. RAG preflight: `node p0-work/tools/rag/pm-rag-agent-preflight.mjs` (если node на хосте
   недоступен — файловый поиск через docker `node:20-alpine`, см. AGENTS.md п. 2.2).
3. Прочитай релевантные заметки Obsidian (`server-backup/srv/obsidian/`,
   `server-backup/opt/processmap-test/PROCESSMAP/`) по темам: deploy, healthcheck, инциденты.

## Workflow

1. Регламентный старт (выше).
2. Подключись и запусти healthcheck:
   ```bash
   ssh stage 'bash -s' < scripts/healthcheck.sh
   echo "exit=$?"
   ```
   Алиас `stage` = root@31.192.110.145 (ключ ~/.ssh/kimi_stage_31, установлен 2026-09-23).
   Работает и `ssh deploy@31.192.110.145` (тот же ключ, deploy в docker-группе). Sudo не нужен.
   Exit-коды: `0` = ok, `1` = warning, `2` = critical.
3. Разбери вывод. По каждой проблеме иди по решение-дереву `references/incidents.md`.
   Карта инфраструктуры (контейнеры, порты, команды) — `references/runbook.md`.
4. Классифицируй итог ровно одним статусом:
   - **OK** — всё зелёное, действий не потребовалось.
   - **FIXED** — что именно починил автономно (команды + результат повторной проверки).
   - **NEEDS_APPROVE** — список предлагаемых действий (rebuild/deploy) с рисками, жди approve.
   - **ESCALATE** — не смог починить: гипотезы, что проверено, что нужно от человека.
5. После ЛЮБОГО автономного действия — повторный healthcheck как доказательство.
6. Отчёт: `.planning/contours/audit/wakeup-stage-<YYYYMMDD>/REPORT.md`
   (5-plane proof: code / workspace / DB / env-compose / serving-mode — насколько применимо)
   и mirror: `bash p0-work/tools/pm-agent-mirror-report.sh <путь к отчёту>`.

## Таблица автономии

| Действие | Разрешено |
|---|---|
| Диагностика (docker ps/logs по `processmap_stage-*`, curl stage URL, df/free, SSL stage) | Автономно |
| `docker restart processmap_stage-<svc>-1` (включая stage-gateway) | Автономно |
| Очистка диска (`/opt/processmap/bin/docker-cleanup.sh`, аналог cron) | Автономно |
| Пересборка образов / `deploy.sh` / `stage-update.sh` / любой deploy | Только после approve |
| Правки `.env.stage`, compose-файлов, nginx-конфигов | Только после approve |
| Любое действие, задевающее `app-*` или processmap.ru | ЗАПРЕЩЕНО (это другой скилл — wakeupprod) |

## Жёсткие запреты

- Без явного approve: никаких merge / deploy / PR / rebuild.
- Не запускать `docker compose down`, `system prune`, `rm` контейнеров — только `restart`.
- Не «чинить» stage через правку prod-сущностей (prod — другой хост, вне границ).
- Stage имеет собственный gateway (`processmap_stage-stage-gateway-1`) — restart его разрешён
  автономно; общего gateway с prod больше нет.
