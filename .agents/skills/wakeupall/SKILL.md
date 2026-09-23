---
name: wakeupall
description: Сводная read-only проверка ОБОИХ окружений ProcessMap (prod processmap.ru, хост 45.87.104.69 + stage stage.processmap.ru, отдельный хост 31.192.110.145). Триггеры — "wakeupall", "проверь всё", "общая доступность", "статус серверов". Только чтение; никаких изменений и restart ни в одном окружении.
---

# wakeupall — сводный будильник ОБОИХ окружений (read-only)

## Границы (обязательно, прочитать первым)

- Это ЕДИНСТВЕННЫЙ wakeup-скилл, которому разрешено смотреть оба окружения:
  - PROD: хост 45.87.104.69, compose-проект `app` (`app-*`), `https://processmap.ru`, порты 443/8008/3001;
  - STAGE: хост 31.192.110.145 (ssh-алиас `stage`), compose-проект `processmap_stage` (`processmap_stage-*`),
    `https://stage.processmap.ru`, порт 28008, собственный gateway `processmap_stage-stage-gateway-1` (80/443 хоста);
  - хостовые ресурсы каждого хоста (диск, память, SSL) — читать можно.
- **Строго read-only.** НИКАКИХ restart / rebuild / deploy / правок / очистки диска —
  даже в stage. Скрипт и агентские команды — только чтение.
- Найденные проблемы НЕ чинятся здесь. Рекомендация в отчёте:
  "запусти wakeupstage" (чинить stage) / "запусти wakeupprod" (диагностика prod).
- ВНИМАНИЕ: на prod-хосте 45.87.104.69 лежит мёртвое зеркало `processmap_stage-*` — это НЕ
  stage. Stage — только 31.192.110.145.

## Регламентный старт

1. Активируй skill `processmap-agent`, затем прочитай `/opt/processmap-test/AGENTS.md`
   (локальное зеркало: `server-backup/opt/processmap-test/AGENTS.md`). Хоста разделены:
   prod app dir `/opt/processmap/app` (45.87.104.69), stage app dir `/opt/processmap/stage/app` (31.192.110.145).
2. RAG preflight: `node p0-work/tools/rag/pm-rag-agent-preflight.mjs` (если node недоступен —
   файловый поиск через docker `node:20-alpine`, см. AGENTS.md п. 2.2).
3. Релевантные заметки Obsidian (`server-backup/srv/obsidian/`) по темам: deploy, healthcheck.

## Workflow

1. Регламентный старт (выше).
2. Запусти healthcheck на ОБОИХ хостах (только чтение):
   ```bash
   ssh deploy@45.87.104.69 'bash -s' < scripts/healthcheck.sh   # prod
   echo "exit=$?"
   ssh stage 'bash -s' < ../wakeupstage/scripts/healthcheck.sh  # stage (алиас = root@31.192.110.145)
   echo "exit=$?"
   ```
   (stage-скрипт фильтрует `processmap_stage-*`, prod-скрипт — `app-*`; оба exit: 0 ok / 1 warn / 2 crit.
   Ключи: prod — deploy@45.87.104.69 как обычно; stage — ~/.ssh/kimi_stage_31 через алиас `stage`.)
3. Сформируй сводную таблицу по каждому окружению:

   | Окружение | URL | Код ответа | Время отклика | Контейнеры | Статус |
   |---|---|---|---|---|---|
   | prod | processmap.ru | ... | ... | n/m up | OK/WARN/CRIT |
   | stage | stage.processmap.ru | ... | ... | n/m up | OK/WARN/CRIT |

   Плюс блок по каждому хосту: диск, память, gateway, SSL своего домена.
4. Классификация итога: **OK** / **WARNING** (список) / **CRITICAL** (список).
   Для каждой проблемы — рекомендация, каким скиллом чинить (wakeupstage / wakeupprod).
5. Отчёт: `.planning/contours/audit/wakeup-all-<YYYYMMDD>/REPORT.md` (5-plane proof,
   read-only: code — версии из /version, env/compose — docker ps, serving — curl)
   и mirror: `bash p0-work/tools/pm-agent-mirror-report.sh <путь к отчёту>`.

## Таблица автономии

| Действие | Разрешено |
|---|---|
| curl обоих окружений, docker ps/logs (read-only) по контейнерам обоих хостов, df/free, SSL, nginx -t | Автономно |
| Любое изменение, restart, rebuild, deploy, cleanup | ЗАПРЕЩЕНО ПОЛНОСТЬЮ (ни stage, ни prod, ни после approve — это не тот скилл) |

## Детали

- Карта обоих окружений: `references/runbook.md`.
- Интерпретация симптомов и куда эскалировать: `references/incidents.md`.
