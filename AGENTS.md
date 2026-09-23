# ProcessMap — Codex/GSD Operating Contract

## 1. Каноническая истина проекта
- Единственный canonical repo root: `/Users/mac/PycharmProjects/processmap_canonical_main`.
- Единственный canonical remote: `git@github.com:xiaomibelov/processmap_v1.git`.
- Baseline для любой новой работы: актуальный `origin/main`.
- Любое расхождение runtime/source truth сначала доказывается, потом исправляется.

## 1.5 Домены и окружения

- **`clearvestnic.ru` не существует в этом проекте.** Домен выведен навсегда и не должен использоваться в коде, конфигах, CI, документации, Obsidian, промптах и примерах. Любое упоминание — мусор, подлежащий удалению или замене.
- **`processmap.ru` = PROD** (сервер `45.87.104.69`).
- **`stage.processmap.ru` = STAGE** — отдельный хост `31.192.110.145` (ssh-алиас `stage` → root, ключ `~/.ssh/kimi_stage_31`; доступен и `deploy@31.192.110.145` тем же ключом; app dir `/opt/processmap/stage/app`; БД `processmap_stage`, user `stage_fpc`; собственный gateway `processmap_stage-stage-gateway-1` на 80/443). Prod-хост stage НЕ обслуживает; сломанное зеркало `processmap_stage-*` на нём удалено 23.09 (cleanup-контур `ops/cleanup-stage-mirror-prod-host-v1`).
- **Других доменов/окружений нет.** Локальная разработка использует `localhost` (`frontend :5177`, `api :8011`), см. раздел 11.

## 2. Ветвление и изоляция контуров
- Новая фича = новая отдельная ветка от `origin/main`.
- Новый баг = новая отдельная ветка от `origin/main`.
- Запрещено смешивать разные contours в одной ветке/PR.
- Если в дереве есть чужие/unrelated изменения, не относящиеся к контуру: `BLOCKED` до безопасной изоляции (например, через clean worktree).

## 3. Runtime/source truth перед validation
- До любых выводов обязательно зафиксировать:
  - `pwd`
  - `git remote -v`
  - `git fetch origin`
  - `git branch --show-current`
  - `git rev-parse HEAD`
  - `git rev-parse origin/main`
  - `git status -sb`
  - `git diff --name-only`
  - `git diff --cached --name-only`
- Правило: если `intended != served`, статус работы = `BLOCKED` до устранения расхождения.

## 4. Доказательная модель (5 плоскостей)
- Перед финальным вердиктом нужно доказать 5 planes:
  - `code` (какой commit/ветка реально содержит fix),
  - `workspace` (какой checkout/worktree реально используется),
  - `DB` (что в durable данных после сценария),
  - `env/compose` (какой environment/compose stack активен),
  - `serving mode` (что реально отдается runtime, а не только локально ожидается).

## 5. Obsidian-first workflow
- Сначала читаются релевантные заметки в `PROCESSMAP` (минимум: `EPIC BOARD`, `ACTIVE TASKS`, релевантные контракты).
- Потом выполняется bounded implementation.
- По итогам обязательно фиксируется короткий handoff в Obsidian: что сделано, что доказано, что осталось.
- **Пути Obsidian:** canonical vault на сервере — `/srv/obsidian/project-atlas/ProcessMap`; рабочий путь для локальных агентов — mirror `server-backup/srv/obsidian/project-atlas/` (внутри workspace `kimi_PM`). Mirror артефактов контуров выполняется только скриптом `./tools/pm-agent-mirror-report.sh` (ROOT/VAULT можно переопределить env-переменными на локальной машине).
- **Точечное чтение:** полный текст заметки/чанка читается только по конкретному пути из дайджеста `pm-task-init.sh` и только если дайджеста недостаточно. Массовое чтение заметок Obsidian запрещено (см. §10, §12).

## 6. Ограничения на изменения
- Без broad refactor без явного доказательства необходимости.
- Без product-code изменений вне заявленного bounded contour.
- Любые решения по runtime/save/revision/status/template контурам не смешиваются между собой без прямого evidence.
- Во frontend product-code запрещены нативные браузерные диалоги (`alert`, `confirm`, `prompt`) для ошибок/продуктовых действий. Используй inline-состояние рядом с действием, toast для краткого сигнала и/или контролируемый modal с доступным retry/cancel.

### 6.1. OpenAPI/spec freshness (blocking rule)
- Любой PR, добавляющий или изменяющий HTTP-эндпоинты, ОБЯЗАН содержать регенерированный `docs/openapi.yaml`.
- Регенерация только через `scripts/dump_openapi.py` (или `./scripts/update_openapi.sh` / `make openapi`), никогда руками.
- Перед коммитом спеки: `./scripts/update_openapi.sh` должен завершиться с `0 errors` линтера `@redocly/cli lint`.
- CI job `spec-drift` блокирует PR, если живая спека (`app.openapi()`) расходится с закоммиченным `docs/openapi.yaml`. Сообщение об ошибке содержит команду регенерации.
- Breaking-изменения API требуют маркера `BREAKING-API-OK` в PR (title/body); без маркера job падает даже при обновлённой спеке.
- PR с изменением роутов без обновления спеки — не принимается.

## 7. Review, merge, release gate
- Review обязателен для каждого bounded контура.
- Merge в `main` только после явного подтверждения пользователя.
- Release flow:
  - `branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> prod deploy via workflow_dispatch 'Deploy to Prod' + approve в GitHub Environment prod (from main only)`.
  - Прод-деплой = workflow_dispatch 'Deploy to Prod' + approve в GitHub Environment `prod`; ручной runbook (`deploy/prod-rollback-manual.md`, `deploy/deploy.sh`) = fallback при недоступности Actions.

## 8. Обязательный финальный proof в каждом серьезном контуре
- Короткий git-proof (`branch`, `HEAD`, `status`, `diffstat`).
- Короткий handoff-proof (что именно было целью, что закрыто, какие риски/ограничения остались).

## 8.5. Graph-first rule для анализа архитектуры (feature/admin-graphs-tab)
- Перед любыми выводами об архитектуре кодовой базы, затрагивающими более одного домена/слоя, агент ОБЯЗАН свериться с актуальным снапшотом графа проекта.
- Источник истины:
  - UI: **Админка → Графы** (`/admin/graphs`), вьювер graphify с зонами и трассировкой.
  - API: `GET /api/admin/graphs/snapshot/current/json` — RAW_NODES с layer/confidence/scenarios.
  - Файл снапшота (только для чтения в runtime): `graphify-out/snapshots/current/graph.json`.
- Что проверять: распределение нод по слоям, top hubs по degree, крупнейшие communities, изолированные ноды, layer gaps (особенно frontend↔backend).
- Если граф устарел или отсутствует — запросить пересборку через `POST /api/admin/graphs/rebuild` и дождаться завершения, прежде чем делать архитектурные рекомендации.
- Это правило не заменяет чтение исходного кода, но служит первичной проверкой контекста и предотвращает фиксацию решений, противоречащих реальной структуре графа.

## 9. Известные операционные проблемы деплоя

- **deploy-stage.yml и server-only конфиги:** workflow деплоит на stage через `git checkout -f` в `/opt/processmap/app`. Локальные серверные конфиги (`.env`, `.env.stage`, `docker-compose.ssl.yml`, `docker-compose.prod.yml`, `docker-compose.prod.gateway.yml`, `backend/alembic.stage.ini`) предварительно копируются во временную директорию, затем принудительно удаляются из рабочего дерева/index перед `git checkout -f`, а после checkout восстанавливаются. Это предотвращает ошибку `error: Entry '.env' not uptodate. Cannot merge.`, возникающую, если файл изменён, помечен `assume-unchanged` или находится в неслитом состоянии после неудачного деплоя.

## 10. RAG-инициализация задачи (shell-first, обязательный шаг 3 цепочки)

Перед планированием/исполнением любого контура агент запускает:

```bash
bash tools/rag/pm-task-init.sh --role <planner|executor|reviewer> --contour <type/name> --task "<краткое описание задачи>"
```

- Обёртка над `tools/rag/pm-rag-agent-preflight.mjs`: проверяет свежесть локального BM25-индекса (`rag-index/RAG_SEARCH_INDEX.json`), при устаревании источников — переиндексация через `rag-index/reindex.sh`, при битом/отсутствующем индексе — полный rebuild.
- Выводит ТОЛЬКО компактный дайджест (≤ 40 строк): статус индекса и топ-10 чанков в формате `score | путь | заголовок`, без текста чанков.
- Правило чтения: полный текст чанка/заметки читается точечно по пути из дайджеста, только если дайджеста недостаточно. Массовое чтение заметок Obsidian запрещено.
- Проектный RAG (`localhost:8011/api/rag/search`, BPMN-сессии) — вне скоупа агентских контуров; любое обращение к нему в агентском флоу = `wrong RAG`.
- Старый прямой вызов preflight/поиск вручную допустим только для отладки, не как шаг цепочки.

## 11. Локальная разработка и инфраструктура

- Локальный стек — docker compose проекта `processmap_v1`: контейнеры именуются `processmap_v1-*` (например, `processmap_v1-frontend-1`, `processmap_v1-api-1`). Любые другие имена контейнеров в проверках регламента не используются.
- Порты: frontend `http://localhost:5177`, API `http://localhost:8011` (host) → `8000` (container).
- **PROD healthcheck:** `curl -s -o /dev/null -w "%{http_code}" https://processmap.ru/` → ожидается `200`. Stage: `https://stage.processmap.ru/`. Других доменов/окружений нет (см. §1.5).

## 12. Токен-экономия (обязательные правила)

1. **Shell-first:** весь сбор контекста — через `rg`/`jq`/`find`/`head`/`git status`. Агент не читает файлы > 120 строк целиком: сначала outline (заголовки/греп), потом точечные диапазоны.
2. **Контекст задачи** = дайджест `pm-task-init.sh` (§10) + точечные чтения по необходимости.
3. **Отчёты и mirror** — только скриптами (`pm-agent-mirror-report.sh`, contour-скрипты); агент не переписывает артефакты контура вручную.
4. **Запрет дублирования:** данные, уже полученные от shell, не повторяются в контексте — на них ссылаются («см. вывод выше»).
5. **Проверка командой:** всё, что можно проверить командой (`bash -n`, `curl`, `git status`, `grep`), проверяется командой, а не рассуждением.

## 13. Бэклог контуров

- **`feature/admin-health-dashboard` — ПЕРЕНЕСЁН В БЭКЛОГ.** Статус: не инициализирован (нет ветки, нет `.planning/contours/feature/admin-health-dashboard/`). Активация — только отдельным explicit approve владельца; до этого любые проверки регламента по этому контуру считаются «ожидает бэклога», а не сбоем.
