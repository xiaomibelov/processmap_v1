# fix: не открывалось меню "..." у строки проекта

## Причина

В `ProjectRow` ячейка действий рендерилась без `relative`, в отличие от `FolderRow`. `ContextMenu` внутри неё использует `absolute right-0 top-full`, поэтому без positioned ancestor меню позиционировалось не относительно ячейки, а относительно внешнего ancestor, что делало его поведение нестабильным.

Кроме того, в legacy-ветке CTA «Открыть проект» был hover-only overlay внутри ячейки названия и физически перекрывал кнопку «···». В актуальном `origin/main` этот overlay уже убран, но оставшийся structural дефект позиционирования сохранял риск регрессии.

## Патч

- `frontend/src/features/explorer/WorkspaceExplorer.jsx`: добавлен класс `relative` к `<td>` действий `ProjectRow` (единственное изменение product-кода).
- `frontend/e2e/explorer-project-kebab-menu.spec.mjs`: новый Playwright e2e-тест, мокирующий `/api/explorer` и проверяющий, что клик по «···» у строки проекта открывает контекстное меню.

## Как проверить

```bash
cd frontend
export PATH="/Users/mac/.local/node/bin:$PATH"

# unit/source тесты explorer
node --test src/features/explorer/*.test.mjs

# e2e тест
VITE_PORT=5178 npm run dev -- --host 127.0.0.1
E2E_APP_BASE_URL=http://127.0.0.1:5178 npx playwright test e2e/explorer-project-kebab-menu.spec.mjs --project=chromium
```

## Результаты тестов

- e2e: `explorer-project-kebab-menu.spec.mjs` — passed.
- explorer unit/source: 152 passed / 1 pre-existing failure (`SessionCreateModal.test.mjs` падает под Node v22 на `globalThis.navigator = ...`, не связано с патчем).

## Скриншоты / видео

- До: при клике по «···» у строки проекта меню не появлялось / позиционировалось некорректно.
- После: меню открывается рядом с кнопкой и содержит пункт «Открыть».

> Видео Playwright сохраняется в `frontend/test-results/` при failure; текущий прогон — зелёный, failure-артефактов нет.

## PR

https://github.com/xiaomibelov/processmap_v1/pull/878

## Что не трогано

- Поведение меню у папок, сессий и разделов не изменено.
- Нет рефакторинга соседних компонентов.
- Без approve: нет merge / deploy / push в `main`.
