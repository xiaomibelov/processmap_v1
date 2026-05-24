# REVIEW_RUNTIME_PROOF — Реестр действий с продуктом (Noise Cleanup v1.0.138)

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- workdir: `/opt/processmap-test`
- runtime: `http://clearvestnic.ru:5180`
- HEAD sha: `5b20bc2d1292f419647238eaf37dac55f9315942`
- Reviewer: Agent 4 (`processmap-agent` / Claude)

## 1. Свежий HTTP smoke

```bash
TS=$(date +%s)
curl -sI "http://clearvestnic.ru:5180/?cb=${TS}" | head -20
```

```
HTTP/1.1 200 OK
Server: nginx/1.27.5
Date: Mon, 18 May 2026 17:42:47 GMT
Content-Type: text/html
Content-Length: 439
Last-Modified: Mon, 18 May 2026 17:38:30 GMT
Connection: keep-alive
ETag: "6a0b4e96-1b7"
Cache-Control: no-cache, no-store, must-revalidate
Pragma: no-cache
Expires: 0
```

- HTTP 200, `Cache-Control: no-cache, no-store, must-revalidate`, `Pragma: no-cache`, `Expires: 0` — без агрессивного кеширования.

## 2. Runtime identity (build-info)

```bash
curl -sS "http://clearvestnic.ru:5180/build-info.json?cb=$(date +%s)"
```

```json
{
  "branch": "fix/lockfile-sync-test",
  "sha": "5b20bc2d1292f419647238eaf37dac55f9315942",
  "shaShort": "5b20bc2",
  "timestamp": "2026-05-18T17:38:43.000Z",
  "contourId": "uiux/product-actions-registry-noise-cleanup-single-container-v1",
  "dirty": true,
  "host": "clearvestnic.ru",
  "sourceWorktree": "/opt/processmap-test",
  "preparedBy": "agent3-executor-merge-finalizer",
  "runId": "20260518T164643Z-83747"
}
```

- `contourId` совпадает с целевым → ревью идёт по правильному контуру, не по чужому артефакту.
- `runId` совпадает с `EXECUTION_RUN_ID` / `REVIEW_RUN_ID`.

## 3. Версия в DOM

Headless Chromium walk (Playwright), свежий контекст, авторизация `admin@local`:

```text
versionLabel: "Версия v1.0.138"
```

- `frontend/src/config/appVersion.js` → `currentVersion: "v1.0.138"`.
- Бамп `v1.0.130 → v1.0.138` подтверждён в `git diff HEAD -- frontend/src/config/appVersion.js`.
- Версия в JS-бандле `assets/index-u4BUFoS0.js`: `grep -oE '"v1\.0\.138"' /tmp/served.js` → 6 вхождений.

## 4. Аналитика IA (preservation)

После клика по «Аналитика» в навигации, текст страницы содержит все 4 элемента IA:

```json
{
  "hasAnalytics": true,
  "hasRegistryActions": true,
  "hasRegistryProps": true,
  "hasDashboards": true
}
```

- `git diff HEAD -- frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` → пустой (не тронут).
- `git diff HEAD -- frontend/src/components/AppShell.jsx frontend/src/components/TopBar.jsx frontend/src/features/explorer/WorkspaceExplorer.jsx` — изменения присутствуют, но они **унаследованы от грязного дерева на момент старта контура** (см. PLAN §10, BRANCH_SCOPE_CHECKLIST §A). Этим контуром не введены, ничего не закоммичено.

## 5. Структура страницы Реестра (DOM, computed style)

Открыто через `[data-testid="analytics-hub-open-registry"]` (т. е. полный пользовательский путь Analytics Hub → Реестр действий с продуктом, не deep-link).

```json
{
  "panelPresent": true,
  "containerPresent": true,
  "sectionCount": 8,
  "sectionsClasses": [
    "productActionsRegistrySection productActionsRegistrySourceBlock",
    "productActionsRegistrySection productActionsRegistrySessions",
    "productActionsRegistrySection productActionsRegistryMetricsSection",
    "productActionsRegistrySection productActionsRegistryFiltersSection",
    "productActionsRegistrySection productActionsRegistryIncompleteBanner",
    "productActionsRegistrySection productActionsRegistryPrimaryActions",
    "productActionsRegistrySection productActionsRegistryPreview",
    "productActionsRegistrySection productActionsRegistryPaginationSection"
  ],
  "containerRadius": "12px",
  "containerBorderTop": "1px solid rgb(229, 231, 235)",
  "containerShadow": "rgba(0, 0, 0, 0.06) 0px 1px 3px 0px",
  "containerBg": "rgb(255, 255, 255)",
  "csvBtns": 1,
  "xlsxBtns": 1,
  "headerTitle": "Реестр действий с продуктом",
  "subtitle": "Сводная таблица действий с продуктами из сессий. Просмотр и экспорт перед финальной выгрузкой."
}
```

- Один белый контейнер: radius 12, border `#E5E7EB`, shadow `0 1px 3px rgba(0,0,0,0.06)`, bg `#FFFFFF`. ✓
- 7 семантических секций спека + пагинация (1 доп. секция-обёртка) — порядок соответствует PLAN §4.3. ✓
- CSV/XLSX встречаются ровно 1 раз каждая на странице. ✓

## 6. Forbidden patterns runtime (computed style внутри `.productActionsRegistryPanel--page`)

```json
{
  "gradient": [],
  "dotted": [],
  "dashed": [],
  "innerShadows": [],
  "warningRow": { "bg": "rgba(0, 0, 0, 0)", "borderTop": "1px solid", "color": "rgb(180, 83, 9)" },
  "activeTab":  { "borderBottom": "2px solid rgb(124, 58, 237)", "color": "rgb(17, 24, 39)" },
  "metricsRow": { "bg": "rgba(0, 0, 0, 0)", "border": "0px none rgb(235, 240, 249)" },
  "metricCount": 5,
  "aiRow":     { "bg": "rgba(0, 0, 0, 0)", "bgImage": "none" },
  "aiButton":  { "bg": "rgb(124, 58, 237)", "color": "rgb(255, 255, 255)" },
  "tableHead": { "bg": "rgb(250, 250, 250)", "grid": "213.594px 267px 373.797px 213.594px" },
  "sessionsListPresent": true
}
```

- `gradient` / `dotted` / `dashed` / `innerShadows` внутри scope реестра — **пусто**. ✓
- Warning row: bg прозрачный, без рамки, цвет `#B45309`. **Без жёлтой подложки**. ✓
- Active scope tab: `border-bottom: 2px solid #7C3AED`, текст `#111827`. ✓
- Metrics row: bg прозрачный, без рамки; 5 метрик одной строкой. ✓
- AI row: bg прозрачный, `background-image: none`. AI-кнопка единственный `#7C3AED` фон в секции. ✓
- Table head: bg `#FAFAFA`, колонки `213.594 / 267 / 373.797 / 213.594 ≈ 20/25/35/20%`. ✓
- Sessions — компактный список (`productActionsRegistrySessionCompactList`), не таблица. ✓

## 7. Раскрытие строки

```json
{
  "openCount": 1,
  "readOnlyFields_per_row": ["ID", "BPMN", "Сессия", "Дата"]
}
```

- Chevron поворачивается (`.productActionsRegistryRow--open .productActionsRegistryRowChevron.isOpen`), max-height transition ON. ✓
- Ровно 4 read-only поля на строку: `ID`, `BPMN`, `Сессия`, `Дата`. ✓

## 8. Фильтры / reset / helper

```json
{
  "filterReset": {
    "color": "rgb(107, 114, 128)",  // #6B7280
    "bg": "rgba(0, 0, 0, 0)",        // transparent
    "border": "0px none rgb(107, 114, 128)",
    "textDecoration": "none"
  },
  "helperText": "Фильтры применяются к загруженным строкам."
}
```

- Reset — текстовая ссылка `#6B7280`, без рамки/фона, underline появляется по hover (CSS-правило `:hover { text-decoration: underline }`). ✓
- Helper-text дословный. ✓

## 9. Network — отсутствие мутаций при просмотре

Pageload + переход в Реестр + клик по строке + переключение scope:

```
GET  /assets/index-u4BUFoS0.js
GET  /assets/index-CLHrtrAu.css
POST /api/auth/refresh        (401 до логина — ожидаемо)
POST /api/auth/login
GET  /api/auth/me
GET  /api/workspaces
GET  /api/meta
GET  /api/note-mentions?limit=20
GET  /api/note-notifications?limit=20&include_read=1
GET  /api/explorer?workspace_id=ws_org_default_main
GET  /api/projects
POST /api/analysis/product-actions/registry/query   ← read-load registry rows
```

- `PUT`/`PATCH`/`DELETE` — **0** вхождений в `pageMutations`. ✓
- POST только для login и `registry/query` (read-load, не мутация). ✓

## 10. Console errors

```
["Failed to load resource: the server responded with a status of 401 (Unauthorized)"]
```

- Единственная ошибка — `401` на `/api/auth/refresh` до логина (стандартное поведение auth-страницы). После логина — чисто.

## 11. CSS-аудит served bundle

`http://clearvestnic.ru:5180/assets/index-CLHrtrAu.css` (593312 байт):

- Правила под `.productActionsRegistryPanel--page` перекрывают унаследованные глобальные правила, в которых остались `linear-gradient` / `dashed` для `.productActionsRegistryPanel` (без `--page`) — это modal-вариант, не активный на этой странице.
- В rendered DOM ни одно из старых правил не применяется (см. §6, gradient/dashed = []).

## 12. Скриншоты

В каталоге `review-screenshots/`:

- `r-01-after-login.png` — стартовая поверхность после логина.
- `r-02-analytics-hub.png` — Analytics Hub с тремя модульными карточками (Реестр действий / Реестр свойств / Дашборды).
- `r-03-registry-default.png` — Реестр действий с продуктом, default scope.
- `r-04-row-open.png` — раскрытая строка с 4 read-only полями.
- `runtime-walk.json` — полный JSON-дамп walk-а.

## 13. Итог runtime-доказательств

| Гейт RUNTIME_PROOF_CHECKLIST | Результат |
|---|---|
| A. Pre-runtime markers | PASS (с оговоркой: `WORKER_2_DONE` 0 байт — см. REVIEW_REPORT §8) |
| B. Runtime smoke | PASS |
| C. Analytics IA preservation | PASS |
| D. Page structure | PASS |
| E. Sections compliance | PASS |
| F. Forbidden patterns runtime | PASS |
| G. Empty / populated state | PASS (рендерится populated workspace + scope-tabs работают; см. ниже) |
| H. Safety | PASS |
| I. Verdict | **REVIEW_PASS** |
