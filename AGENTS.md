# ProcessMap — Codex/GSD Operating Contract

## 1. Каноническая истина проекта
- Единственный canonical repo root: `/Users/mac/PycharmProjects/processmap_canonical_main`.
- Единственный canonical remote: `git@github.com:xiaomibelov/processmap_v1.git`.
- Baseline для любой новой работы: актуальный `origin/main`.
- Любое расхождение runtime/source truth сначала доказывается, потом исправляется.

## 1.5 Домены и окружения

- **`clearvestnic.ru` не существует в этом проекте.** Домен выведен навсегда и не должен использоваться в коде, конфигах, CI, документации, Obsidian, промптах и примерах. Любое упоминание — мусор, подлежащий удалению или замене.
- **`processmap.ru` = PROD** (сервер `45.87.104.69`).
- **`stage.processmap.ru` = STAGE**.
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

## 6. Ограничения на изменения
- Без broad refactor без явного доказательства необходимости.
- Без product-code изменений вне заявленного bounded contour.
- Любые решения по runtime/save/revision/status/template контурам не смешиваются между собой без прямого evidence.

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
  - `branch -> push -> PR -> user approval -> merge -> auto deploy to stage -> verify -> manual prod deploy (from main only)`.

## 8. Обязательный финальный proof в каждом серьезном контуре
- Короткий git-proof (`branch`, `HEAD`, `status`, `diffstat`).
- Короткий handoff-proof (что именно было целью, что закрыто, какие риски/ограничения остались).

## 9. Известные операционные проблемы деплоя

- **deploy-stage.yml и server-only конфиги:** workflow деплоит на stage через `git checkout -f` в `/opt/processmap/app`. Локальные серверные конфиги (`.env`, `.env.stage`, `docker-compose.ssl.yml`, `docker-compose.prod.yml`, `docker-compose.prod.gateway.yml`, `backend/alembic.stage.ini`) предварительно копируются во временную директорию, затем принудительно удаляются из рабочего дерева/index перед `git checkout -f`, а после checkout восстанавливаются. Это предотвращает ошибку `error: Entry '.env' not uptodate. Cannot merge.`, возникающую, если файл изменён, помечен `assume-unchanged` или находится в неслитом состоянии после неудачного деплоя.
