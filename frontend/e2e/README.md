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
- `E2E_USER` / `E2E_PASS` для логина в защищённый backend API (fallback: `E2E_ADMIN_EMAIL` / `E2E_ADMIN_PASSWORD`, затем `admin@local` / `admin`)
- `E2E_BPMN_MCP_URL` для optional MCP fixture source
- `E2E_BROWSER` (`chromium` по умолчанию, `webkit` для fallback)

## Big fixtures (MCP on/off)

MCP on (через mock endpoint):
`E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/bpmn-roundtrip-big.spec.mjs e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list`

MCP off (local fixture fallback):
`E2E_BROWSER=webkit E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/bpmn-roundtrip-big.spec.mjs e2e/tab-transition-matrix-big.spec.mjs --workers=1 --reporter=list`

## MCP wiring smoke

Поднять mock MCP:
`node frontend/e2e/helpers/mcpMockServer.mjs`

Запустить короткий smoke-spec:
`cd frontend && E2E_BROWSER=webkit E2E_BPMN_MCP_URL=http://127.0.0.1:65534/mcp npx playwright test e2e/mcp-wiring-smoke.spec.mjs --workers=1 --reporter=list`
