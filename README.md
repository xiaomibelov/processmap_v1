Food Process Copilot (MVP)

Запуск:
- docker compose up --build
- frontend UI (через gateway): http://localhost:${FRONTEND_PORT:-5177}
- backend API: http://localhost:${HOST_PORT}
- если ранее использовался сервис `app`, запустить один раз: `docker compose up -d --remove-orphans`

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
- `gateway` — Nginx reverse-proxy (единая точка входа для браузера)

Auth + routes:
- Public home: `/`
- Login page: `/login`
- Protected workspace: `/app`
- Auth API:
  - `POST /api/auth/login` → `{access_token, token_type}` + HttpOnly `refresh_token` cookie
  - `POST /api/auth/refresh` → rotation refresh + новый access
  - `POST /api/auth/logout` → revoke refresh + clear cookie
  - `GET /api/auth/me` → профиль текущего пользователя
