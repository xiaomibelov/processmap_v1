# Screenshots Capture Status

Дата проверки: 2026-02-21.

Целевая папка для артефактов:
- `docs/screens/01_landing.png`
- `docs/screens/02_landing_login_modal.png`
- `docs/screens/03_login_page.png`
- `docs/screens/04_workspace_topbar.png`
- `docs/screens/05_diagram_normal.png`
- `docs/screens/06_sidebar_node_unselected.png`
- `docs/screens/07_sidebar_node_selected.png`
- `docs/screens/08_sidebar_notes_saved.png`
- `docs/screens/09_diagram_quality.png`
- `docs/screens/10_quality_show_on_diagram_focus.png`
- `docs/screens/11_diagram_coverage.png`
- `docs/screens/12_interview_stage.png`
- `docs/screens/13_reload_state.png`

## Фактический статус
Автосъём в текущем окружении не завершился из-за падения Playwright browser launch (нестабильно, но воспроизводимо на e2e запуске):
- `webkit`: `Abort trap: 6` при запуске `pw_run.sh`
- `chromium`: `signal=SIGTRAP` при запуске `chrome-headless-shell`

Пример команд проверки:
- `cd frontend && E2E_BROWSER=webkit E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/auth-routing-login.spec.mjs --workers=1 --reporter=list`
- `cd frontend && E2E_BROWSER=chromium E2E_APP_BASE_URL=http://127.0.0.1:5177 E2E_API_BASE_URL=http://127.0.0.1:8011 npx playwright test e2e/auth-routing-login.spec.mjs --workers=1 --reporter=list`

Обе команды завершились ошибками launch, поэтому PNG в этой папке не созданы автоматически.
