# CONFIG_CHANGELOG.md — fix/llm-output-contract-residuals

В этом контуре **изменений конфигурации не вносилось**.

- Стратегия LLM-провайдеров (strategy-B) остаётся без изменений.
- Nginx-роутинг не менялся.
- Переменные окружения compose не менялись.
- Alembic-миграции не менялись.

Фикс целиком в frontend view-логике (`processmanView.js:extractAnswerText`).
