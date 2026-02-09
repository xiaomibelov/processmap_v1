Food Process Copilot (MVP)

Запуск:
- docker compose up --build
- открыть http://localhost:${HOST_PORT}

Сценарий:
- Новая сессия
- Вставляешь заметки
- Справа отвечаешь на вопросы
- Экспорт "как код" в workspace/processes/...

DeepSeek:
- DEEPSEEK_API_KEY в .env
- без ключа работает stub extractor/questions
