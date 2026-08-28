# PR: fix/purge-clearvestnic-domain

**Цель:** полностью вычистить упоминания выведенного домена `clearvestnic.ru` из активных конфигов, документации и RAG-facts; пометить исторические артефакты как DEPRECATED; зафиксировать правило доменов/окружений в `AGENTS.md`.

## Правило доменов/окружений (добавлено в AGENTS.md)

- `clearvestnic.ru` — **не существует** в проекте. Домен выведен навсегда.
- `processmap.ru` = **PROD**.
- `stage.processmap.ru` = **STAGE**.
- Других доменов/окружений нет.
- Локальная разработка: `localhost:5177` (frontend), `localhost:8011` (api).

## Найденные вхождения по категориям

### 1. Заменено (активные конфиги / документы)

| Файл | Что изменено |
|------|--------------|
| `AGENTS.md` | Добавлен раздел 1.5 «Домены и окружения» с запретом `clearvestnic.ru`. |
| `tools/rag/facts/processmap-runtime-facts.json` | `test` runtime → `stage.processmap.ru`, `https://stage.processmap.ru/api/health`. |
| `tools/rag/facts/processmap-agent-rules.json` | Agent 3 fresh-runtime check: `http://clearvestnic.ru:5180` → `http://localhost:5177`. |
| `tools/rag/facts/processmap-validation-facts.json` | Вопрос «test runtime» → «local dev runtime» (`localhost:5177/8011`). |
| `tools/rag/processmap-rag-validation-queries.json` | `q6-test-runtime` query / terms / summary → `localhost:5177/8011`. |
| `docs/agent/AGENT_SVC_PLAN.md` | Stage host `clearvestnic.ru:5177` → `stage.processmap.ru`. |
| `docs/agent/AGENT_SVC_PHASE5_VERIFICATION.md` | Stage host reference updated. |

### 2. Помечено DEPRECATED (исторические артефакты)

| Область | Количество файлов | Примечание |
|---------|-------------------|------------|
| `.planning/contours/**/*` | 128 | Только баннер в начало; содержимое не переписывалось. |
| `/srv/obsidian/project-atlas/ProcessMap/**/*` | 468 | Только баннер; содержимое не переписывалось. |

### 3. Удалено

- Нет отдельных файлов целиком из `clearvestnic.ru` — все вхождения либо заменены, либо помечены.

## Чек-лист проверки

- [x] `grep -ri "clearvestnic" .github/workflows/` — пусто.
- [x] `grep -ri "clearvestnic" . --exclude-dir=.git --exclude-dir=.planning` — только правило в `AGENTS.md`.
- [x] Все затронутые JSON распарсились (`python3 -m json.tool`).
- [x] Активные документы (`docs/agent/*`) больше не ссылаются на `clearvestnic.ru`.
- [x] Исторические `.planning` и Obsidian-файлы содержат DEPRECATED-баннер.
- [x] Артефакты контура созданы и замиррорены.

## Ограничения / риски

- Исторические JSON-артефакты (`STATE.json`, `fps_measurements.json` и др.) всё ещё содержат `clearvestnic.ru` внутри структурированных данных, но каждый файл предварён DEPRECATED-комментарием. Содержимое не переписывалось по требованию.
- RAG-валидатор `pm-rag-validate-facts.mjs` и раннер `pm-rag-run-validation-queries.mjs` требуют отсутствующий `RAG_SEARCH_INDEX_BALANCED.json` и canonical пути `/opt/processmap-test`; в рамках этого контура не запускались. Изменённые JSON-файлы прошли ручную JSON-валидацию.
- Сервер `45.87.104.69` не трогался; nginx-конфиги — отдельный ops-контур.

## Merge gate

- [ ] Owner approval.
