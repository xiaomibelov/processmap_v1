# TESTS — fix/bpmn-drilldown-ui

## Ручная проверка

### Подготовка
1. Открыть стенд `http://clearvestnic.ru:5177` (ветка `fix/bpmn-drilldown-ui`).
2. Авторизоваться, открыть проект с BPMN-диаграммой, содержащей `CallActivity`/`SubProcess`.
3. Убедиться, что для child-сессии есть открытые обсуждения (создать thread через панель обсуждений).

### 1. Breadcrumb offset
- Открыть child-сессию через drilldown-стрелку.
- **Ожидаемо**: панель breadcrumb располагается внутри канваса с отступом ~12px от верхнего края рабочей области, не перекрывает кнопки «Сохранить сессию» / «Создать версию BPMN».
- Проверить в DevTools: `.subprocessBreadcrumbsOnCanvas { top: 12px; left: 12px; pointer-events: none; }`, внутренний блок — `pointer-events: auto`.

### 2. Discussion badge на родительской диаграмме
- Вернуться к родительской сессии.
- **Ожидаемо**: на элементе `CallActivity`/`SubProcess`, для которого есть child-сессия с обсуждениями, в правом верхнем углу появляется badge `💬 N` (`data-badge-kind="subprocess_discussions"`).
- При hover показывается tooltip `Открытые обсуждения: N`.
- Если обсуждений нет — badge не отображается.

### 3. Loading state при drill-down
- Кликнуть на `.bjs-drilldown` стрелку.
- **Ожидаемо**: до появления child-диаграммы в центре канваса виден спиннер/скелетон `Загрузка диаграммы…` (`data-testid="diagram-skeleton"`).
- Маркер `data-testid="diagram-ready"` исчезает на время загрузки и появляется снова.
- После завершения импорта скелетон скрывается и канвас становится интерактивным.

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

### E2E
```bash
node scripts/e2e/check_subprocess_click.mjs
```
- Создаёт тестовую сессию с `SubProcess`.
- Проверяет, что одиночный клик по `SubProcess` не навигирует.
- Кликает `.bjs-drilldown`, проверяет, что `diagram-ready` исчезает (загрузка), затем появляется снова.
- Проверяет переход к child-сессии и работу кнопки «Назад».

### Unit
```bash
node --test frontend/src/lib/sessionNoteAggregates.test.mjs
```
- 3/3: batch-запрос aggregate, дедуплицирование, инвалидация кеша.

### Сборка
```bash
npm --prefix frontend run build
```
- Должна пройти без ошибок.
- Ожидаемые предупреждения: pre-existing chunk-size advisory.

## Чеклист перед review
- [x] Все 5 ручных сценариев пройдены на стенде.
- [x] E2E зелёный.
- [x] `npm run build` зелёный.
- [x] `git diff --check` зелёный.
- [x] Нет изменений вне UI-слоя drill-down.
