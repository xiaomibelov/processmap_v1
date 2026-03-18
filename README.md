Food Process Copilot (MVP)

Запуск:
- зафиксировать источник кода для runtime (обязательно):
  `scripts/runtime_source.sh pin /absolute/path/to/source-root`
- если нужно подмешать только frontend из другого source root:
  `scripts/runtime_source.sh pin-frontend /frontend/source/root /base/source/root`
- старт:
  `scripts/runtime_source.sh up --build`
- проверка, что контейнеры читают именно pinned source root:
  `scripts/runtime_source.sh doctor`
- frontend UI (через gateway): http://localhost:${FRONTEND_PORT:-5177}
- backend API: http://localhost:${HOST_PORT}
- если ранее использовался сервис `app`, запустить один раз:
  `scripts/runtime_source.sh up -d --remove-orphans`

Runtime source control:
- `scripts/runtime_source.sh show` — показать текущие `FPC_*_SOURCE_ROOT`.
- `scripts/runtime_source.sh unpin` — убрать pin (последующий `up` без pin завершится ошибкой).
- `scripts/runtime_source.sh up/down/restart/ps/logs/config` — обертка над compose c `docker-compose.source-root.yml`.
- `scripts/runtime_source.sh pin-frontend <frontend_root> [base_root]` — frontend из отдельного root, api/workspace/gateway из base root.
- локальный pin хранится в `.runtime_source.env` (не коммитится).

Сценарий:
- Новая сессия
- Вставляешь заметки
- Справа отвечаешь на вопросы
- Экспорт "как код" в workspace/processes/...

DeepSeek:
- DEEPSEEK_API_KEY в .env
- без ключа работает stub extractor/questions

Переменные окружения:
- HOST_PORT — порт backend (в контейнере всегда 8000)
- FRONTEND_PORT — порт gateway/UI (nginx → frontend service)
- JWT_SECRET — секрет подписи access/refresh JWT
- JWT_ACCESS_TTL_MIN — TTL access токена в минутах
- JWT_REFRESH_TTL_DAYS — TTL refresh токена в днях
- COOKIE_SECURE — `1` в production (secure cookie), `0` в локальной разработке
- COOKIE_SAMESITE — `Lax|Strict|None`
- DEV_SEED_ADMIN — `1`, чтобы при старте автоматически создать admin-пользователя
- ADMIN_EMAIL / ADMIN_PASSWORD — dev-учётка для входа

Сервисы:
- `api` — FastAPI backend
- `frontend` — Vite/React UI
- `redis` — primary runtime performance layer (locks/cache/jobs queue)
- `postgres` — primary runtime DB backend
- `gateway` — Nginx reverse-proxy (единая точка входа для браузера)

DB backend selection:
- `FPC_DB_BACKEND=postgres` + `DATABASE_URL=postgresql://...` — основной путь.
- `FPC_DB_BACKEND=sqlite` — legacy/local режим на `PROCESS_DB_PATH` или `PROCESS_STORAGE_DIR/processmap.sqlite3`.
- `FPC_DB_STARTUP_CHECK=1` (по умолчанию) — fail-fast проверка DB соединения и schema bootstrap при старте API.

Redis policy:
- `REDIS_URL` — Redis DSN (по умолчанию в compose: `redis://redis:6379/0`).
- `REDIS_REQUIRED=1` — Redis считается штатным путём; OFF трактуется как degraded/incident fallback.
- При недоступности Redis backend остаётся доступным, но переключается в fallback mode с warning/error семантикой.

SQLite -> PostgreSQL data transfer:
- Скрипт: `backend/scripts/sqlite_to_postgres.py`
- Пример (внутри `api` контейнера):
  `python /app/backend/scripts/sqlite_to_postgres.py --source-sqlite /app/workspace/.session_store/processmap.sqlite3 --postgres-url postgresql://fpc:fpc@postgres:5432/processmap --reset-target`

Auth + routes:
- Public home: `/`
- Login page: `/login`
- Protected workspace: `/app`
- Auth API:
  - `POST /api/auth/login` → `{access_token, token_type}` + HttpOnly `refresh_token` cookie
  - `POST /api/auth/refresh` → rotation refresh + новый access
  - `POST /api/auth/logout` → revoke refresh + clear cookie
  - `GET /api/auth/me` → профиль текущего пользователя
