# BPMN 123: локальное Docker-окружение

Контур: `infra/bpmn123-local-docker-dev-environment-v1`

## Зачем нужно отдельное окружение

BPMN 123 будет отдельным игровым BPMN-тренажёром поверх ProcessMap engine. До реализации route, shell, validation, XP и overlay нужно иметь изолированный локальный Docker-контур, который:

- не запускает существующий `docker-compose.yml`;
- не трогает текущие контейнеры ProcessMap;
- не поднимает Postgres/Redis без необходимости;
- использует отдельный compose project name;
- занимает только заранее проверенный свободный порт.

## Архитектурное решение

Выбран вариант **A: отдельный compose-файл**.

| Вариант | Решение | Причина |
|---|---|---|
| Новый `docker-compose.bpmn123.local.yml` | Да | Изолирует project/container/volume names |
| Profile в существующем compose | Нет | Риск случайно поднять обычный ProcessMap stack |
| Только npm/vite без Docker | Нет | Контур требует Docker-доказательство |
| Полная копия ProcessMap stack | Нет | Backend/DB/Redis не нужны до BPMN 123 skeleton |

## Compose-файлы

| Файл | Роль |
|---|---|
| `docker-compose.bpmn123.local.yml` | Единственный compose-файл для BPMN 123 local dev |
| `frontend/Dockerfile.bpmn123.local` | Локальный frontend image только для BPMN 123; использует `npm install --package-lock=false`, потому что текущий lockfile на `origin/main` не проходит `npm ci` |
| `.env.bpmn123.local.example` | Пример локальных переменных без секретов |
| `docker-compose.yml` | Обычный ProcessMap stack; в этом контуре не запускать |
| `docker-compose.prod.yml` | Production compose; не трогать |
| `docker-compose.prod.gateway.yml` | Production gateway compose; не трогать |
| `docker-compose.ssl.yml` | SSL compose; не трогать |

## Выбранные порты

Проверенные кандидаты: `5177`, `5178`, `5180`, `5190`, `5277`, `8087`, `8088`, `8090`.

| Порт | Решение | Почему |
|---:|---|---|
| 5177 | selected frontend port | первый свободный preferred port |
| 8087 | reserved placeholder only | backend в этом контуре не поднимается |

Финальный URL:

```text
http://localhost:5177
```

## Контейнеры

| Контейнер | Роль | Правило |
|---|---|---|
| `bpmn123-frontend-local` | Vite frontend dev server | можно запускать/останавливать только командами BPMN 123 |
| Любые существующие контейнеры | Не принадлежат этому контуру | не останавливать, не удалять, не пересоздавать |

## Запуск

```bash
docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml up --build
```

## Остановка только BPMN 123 окружения

```bash
docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml down
```

## Проверка статуса

```bash
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"
docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml ps
curl -I http://localhost:5177
```

Ожидаемо: `curl` возвращает HTTP `200` или корректный Vite dev response.

## Диагностика port conflict

Проверить занятые порты:

```bash
lsof -nP -iTCP -sTCP:LISTEN | grep LISTEN || true
```

Если `5177` занят:

1. не останавливать чужой процесс;
2. выбрать следующий свободный порт из `5178`, `5180`, `5190`, `5277`;
3. запустить с override:

```bash
BPMN123_FRONTEND_PORT=5178 BPMN123_VITE_PORT=5178 BPMN123_VITE_HMR_PORT=5178 \
docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml up --build
```

4. зафиксировать новый порт в документации контура.

## Docker/source inventory на момент контура

| Resource | Name/Port | Status | Touch? |
|---|---|---|---|
| Docker daemon | `unix:///Users/mac/.docker/run/docker.sock` | изначально недоступен; затем поднят через Docker Desktop | только запуск daemon, без операций над чужими контейнерами |
| Local TCP | `5177` | свободен | selected |
| Local TCP | `5178`, `5180`, `5190`, `5277` | свободны | fallback only |
| Local TCP | `8087`, `8088`, `8090` | свободны | backend placeholder only |
| Local TCP | `5432` | занят local Postgres | не трогать |
| Local TCP | `1080`, `1087` | заняты v2ray | не трогать |
| Local TCP | `27123`, `27124` | заняты Obsidian | не трогать |

## Source map текущего dev/Docker

| Файл | Текущая роль | Значение для BPMN 123 local dev | Риск |
|---|---|---|---|
| `docker-compose.yml` | Полный ProcessMap stack: api, frontend, redis, postgres, gateway | Не использовать в BPMN 123 контуре | Может поднять DB/Redis/gateway и занять чужие порты |
| `frontend/Dockerfile` | Node 20 Alpine + `npm ci` + Vite dev server | Reuse для isolated frontend container | Внутренний default port 5177 совпадает с выбранным |
| `frontend/Dockerfile.bpmn123.local` | Local-only Node/Vite image for BPMN 123 | Используется новым compose-файлом | Менее детерминирован, чем `npm ci`, но не меняет lockfile в infra-контуре |
| `Dockerfile` | FastAPI backend image | Не нужен до backend/API contour | Поднятие backend потянет env/DB/Redis вопросы |
| `frontend/package.json` | `dev`, `build`, `test`, e2e scripts | Compose вызывает существующий `npm run dev` | Не менять scripts без необходимости |
| `frontend/vite.config.js` | `VITE_PORT`, strict port, HMR, `/api` proxy | Compose задаёт отдельные env vars | `/api` proxy placeholder без backend может давать ошибки только при API запросах |
| `.env.example` | Обычный ProcessMap env включая DB/Redis/auth | Не использовать как BPMN 123 env | Содержит обычный stack assumptions |
| `docker-compose.prod*.yml` | Production deploy configs | Не трогать | Production/stage risk |

## Runtime validation evidence

| Проверка | Результат |
|---|---|
| `docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml config` | pass |
| `docker compose -p bpmn123-local -f docker-compose.bpmn123.local.yml up --build -d` | pass |
| Container | `bpmn123-frontend-local` |
| Container status | `Up ... (healthy)` |
| Published port | `0.0.0.0:5177->5177/tcp` |
| Vite log | `VITE v5.4.21 ready`, `Local: http://localhost:5177/` |
| `curl -I http://localhost:5177` | `HTTP/1.1 200 OK` |
| Docker projects после запуска | `bpmn123-local`, Docker Desktop `portainer_portainer-docker-extension-desktop-extension` |

> [!NOTE]
> Первый build через штатный `frontend/Dockerfile` был отклонён, потому что `npm ci` на `origin/main` не проходит из-за рассинхронизации `frontend/package.json` и lockfile. Контур не меняет lockfile и не чинит продуктовую зависимость; вместо этого используется отдельный local-only `frontend/Dockerfile.bpmn123.local` с `npm install --package-lock=false`.

## Git/branch/commit rules

- Работать от `origin/main`.
- Использовать ветку `infra/bpmn123-local-docker-dev-environment-v1`.
- Не менять stage/prod deploy.
- Не коммитить `.env`, `node_modules`, build artifacts, logs.
- После validation сделать коммит с русским содержательным сообщением.

## Следующий безопасный контур

После доказанного Docker local dev окружения: `plan/bpmn123-game-mode-architecture-v1`.
