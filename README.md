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

Сервисы:
- `api` — FastAPI backend
- `frontend` — Vite/React UI
- `gateway` — Nginx reverse-proxy (единая точка входа для браузера)
