# TESTS — fix/bpmn-drilldown-ui

## Ручная проверка

### Подготовка
1. Запустить dev-сервер или использовать стенд после деплоя.
2. Авторизоваться, открыть проект с BPMN-диаграммой, содержащей `CallActivity`/`SubProcess`.
3. Убедиться, что для child-сессии есть открытые обсуждения (создать thread через панель обсуждений).

### 1. Breadcrumb offset
- Открыть child-сессию через drilldown-стрелку.
- **Ожидаемо**: панель breadcrumb располагается внутри канваса с отступом ~12px от верхнего края рабочей области, не перекрывает кнопки «Сохранить сессию» / «Создать версию BPMN».
- Проверить в DevTools: `.subprocessBreadcrumbsOnCanvas { top: 12px; left: 12px; pointer-events: none; }`, внутренний блок — `pointer-events: auto`.

### 2. Discussion badge на родительской диаграмме
- Вернуться к родительской сессии.
- **Ожидаемо**: на элементе `CallActivity`/`SubProcess`, для которого есть child-сессия с обсуждениями, в правом верхнем углу появляется badge `💬 N`.
- При hover показывается tooltip `Открытые обсуждения: N`.
- Клик по badge выделяет элемент и открывает панель обсуждений.
- Если обсуждений нет — badge не отображается.

### 3. Loading state при drill-down
- Кликнуть на `.bjs-drilldown` стрелку.
- **Ожидаемо**: до появления child-диаграммы в центре канваса виден спиннер/скелетон `Загрузка диаграммы…` (`data-testid="diagram-skeleton"`).
- После завершения импорта скелетон исчезает и канвас становится интерактивным.

### 4. Loading state при возврате
- В child-сессии нажать кнопку «Назад» в breadcrumb.
- **Ожидаемо**: аналогично п.3 — виден спиннер до появления родительской диаграммы.

### 5. Loading state при открытии сессии
- Скопировать URL сессии, открыть в новой вкладке / нажать F5.
- **Ожидаемо**: до появления диаграммы виден спиннер `Загрузка диаграммы…`, после — канвас с диаграммой.

### 6. Регрессии
- Убедиться, что одиночный клик по телу `CallActivity`/`SubProcess` не вызывает drill-down.
- Убедиться, что drilldown-стрелка открывает child-сессию.
- Убедиться, что pan/zoom/selection работают после загрузки.
- В Network — 0 PUT `/bpmn` и 0 PATCH `/sessions` из view-режима.

## Автотесты

### Существующие
```bash
node scripts/e2e/check_subprocess_click.mjs
```
Должен остаться зелёным.

### Новые E2E-проверки (добавить в `scripts/e2e/check_subprocess_click.mjs`)

```js
// После клика на drilldown-стрелку
await page.waitForSelector('[data-testid="diagram-skeleton"]', { timeout: 5000 });
await page.waitForSelector('[data-testid="bpmn-stage-ready"]', { timeout: 15000 });

// Проверка badge обсуждений на родительской диаграмме
await page.goto(parentUrl);
await page.waitForSelector('[data-badge-kind="subprocess_discussions"]', { timeout: 15000 });
const badge = await page.locator('[data-element-id="CallActivity_1"] [data-badge-kind="subprocess_discussions"]').first();
await expect(badge).toContainText("1");
```

### Unit / интеграция
- `sessionNoteAggregates.test.mjs` — добавить тест на `useChildSessionNoteAggregatesByElementId`:
  - фильтрация по `parent_session_id`,
  - маппинг `element_id_in_parent` → aggregate,
  - игнорирование сессий без `element_id_in_parent`.
- `decorManager.test.mjs` — добавить тест рендера badge для subprocess-элемента с `open_notes_count > 0`.

### Сборка
```bash
npm --prefix frontend run build
```
- Должна пройти без ошибок.
- Ожидаемые предупреждения: pre-existing chunk-size advisory.

## Чеклист перед review
- [ ] Все 5 ручных сценариев пройдены.
- [ ] E2E зелёный.
- [ ] `npm run build` зелёный.
- [ ] `git diff --check` зелёный.
- [ ] Нет изменений вне UI-слоя drill-down.
