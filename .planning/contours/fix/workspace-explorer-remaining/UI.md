# fix/workspace-explorer-remaining — UI

Дата: 2026-09-02.

## Источник Скриншотов

Before: скриншоты из audit-контура `audit/workspace-explorer-remaining`, снятые на stage build `d8abc4a1c45fa31d3b6c68ebd1a1b21fc761aabc`.

After: локальный frontend текущей ветки `fix/workspace-explorer-remaining`, `VITE_API_PROXY_TARGET=https://stage.processmap.ru`, stage data.

## Workspace 1280px

Before:

- `screenshots/before-audit-workspace-1280.png`

After:

- `screenshots/after-workspace-1280.png`

Проверка:

- Поиск и create-actions больше не находятся в глобальной полосе рядом с `Проекты / Аналитика / DK`.
- Локальный toolbar workspace расположен ниже nav/breadcrumb row и выше filter chips/table header.
- Search icon — SVG 16px, не текстовый glyph `⌕`.
- Вертикальная граница sidebar остаётся отдельной осью; toolbar и table backgrounds начинаются после неё.
- В колонке `Состав` видны единицы: `N проектов`, `X/Y сессии`; голых `3/148` нет.

## Workspace 1920px

Before:

- `screenshots/before-audit-workspace-1920.png`

After:

- `screenshots/after-workspace-1920.png`

Проверка:

- Toolbar не смешивается с global header на широком viewport.
- Горизонтальные линии nav row / toolbar / filter chips / table header не создают нового sidebar overlap.
- Sidebar active row остаётся внутри sidebar; не залезает в table area.
- Table hover/zebra backgrounds начинаются в content area после разделителя.

## Assignee UI

Before:

- `screenshots/before-audit-assignee-ui.png`

After:

- Визуальный after для successful save на stage не снят: stage backend на момент проверки ещё не содержит fix F1 и продолжает быть непригодным для валидного `PUT /api/sessions/:id/assignees` с непустым `user_ids`.
- UI-регрессия покрыта source test: `workspaceExplorerRemaining.source.test.mjs`.
- API-регрессия покрыта backend test: `test_session_assignees_api.py`.

## Toast / CLS

Реализация:

- `WorkspaceExplorerToast` находится в fixed viewport: `pointer-events-none fixed bottom-5 right-5`.
- Toast button имеет `pointer-events-auto`, закрывается по клику.
- Auto-dismiss: 3500 ms.
- Accessibility: `role="status"`, `aria-live="polite"`.

CLS:

- По DOM-структуре toast не занимает место в flex-column и не вставляет `border-b` перед таблицей.
- Локальный headless screenshot подтверждает, что toolbar/filter/table остаются на месте без in-flow success banner.
- Численный `PerformanceObserver` CLS на mutation не снят, потому что successful stage mutation заблокирована отсутствием backend fix на stage до deploy этой ветки.

## ui-ux-pro-max Checklist

Применённые критерии:

- `toast-dismiss`: auto-dismiss 3-5s — выполнено.
- `toast-accessibility`: live region без focus stealing — выполнено.
- `content-jumping` / `layout-shift-avoid`: toast не влияет на layout — выполнено по source/DOM.
- `state-preservation`: assignment handler не сбрасывает tree state — выполнено по source regression.
- `nav-hierarchy`: global navigation отделена от workspace toolbar — выполнено.
- `form-labels`: search input имеет label — выполнено.

Нулевые результаты skill:

- `search.py "toast notification"` auto-domain: 0.
- `search.py "tree view state"` auto-domain: 0.
- `search.py "toolbar layout"` auto-domain: 0.
- `search.py "search icon" --domain icons`: 0.

Повтор с `--domain ux` дал применимые результаты и использован как checklist.
