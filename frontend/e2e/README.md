# E2E (Playwright)

Цель текущих сценариев:
- проверить, что правки на `Diagram` (перемещение + добавление BPMN-элемента) сохраняются при переключениях между вкладками `Diagram/Interview/XML`;
- закрыть e2e-матрицу направленных переходов между вкладками (`Interview↔Diagram`, `Interview↔XML`, `Diagram↔XML`) с проверкой автосохранения.

## Запуск

1. Установить зависимости (один раз):
   `npm i -D @playwright/test && npx playwright install chromium`
2. Поднять backend и frontend:
   backend: `http://127.0.0.1:8011`
   frontend: `http://127.0.0.1:5177`
3. Запустить:
   `npm run test:e2e`

## Переменные окружения

- `E2E_APP_BASE_URL` (по умолчанию `http://127.0.0.1:5177`)
- `E2E_API_BASE_URL` (по умолчанию `http://127.0.0.1:8011`)
