# PR — fix/bpmn-drilldown-ui

## Заголовок
```
fix(frontend): UI-дефекты drill-down — breadcrumb offset, badge обсуждений, loading states
```

## Описание
Исправляет 4 UI-дефекта вокруг навигации по BPMN-подпроцессам.

### Что изменено
1. **Breadcrumb больше не прилипает к хедеру.**
   - `.subprocessBreadcrumbsOnCanvas` получила `top: 12px` и сохранила `pointer-events` separation.
2. **Badge открытых обсуждений на элементах родительской диаграммы.**
   - Новый хук `useChildSessionNoteAggregatesByElementId` маппит child-сессии на `element_id_in_parent`.
   - `decorManager.js` рисует компактный чат-badge для `CallActivity`/`SubProcess`, если у child-сессии есть `open_notes_count > 0`.
3. **Loading state при drill-down и возврате.**
   - `useDiagramLoadStateMachine` подключена к жизненному циклу импорта.
   - `bpmnRenderRuntimeLifecycle.js` вызывает `transition("import_start")` / `transition("import_success")`.
   - Canvas обёрнут в `DiagramLoadBoundary`, который показывает `DiagramSkeleton` до завершения `importXML`.
4. **Loading state при открытии сессии.**
   - Тот же boundary/state machine работает и для первоначальной загрузки диаграммы.

### Не изменено
- Логика сохранения BPMN XML.
- API backend (только чтение существующих note-aggregate).
- XML-экспорт/импорт.
- Product Actions, RAG, AG-UI.

## Тесты
- `node scripts/e2e/check_subprocess_click.mjs` — зелёный.
- Добавлена E2E-проверка видимости спиннера при drill-down.
- Добавлены unit-тесты для маппинга child aggregate и decor badge.
- `npm run build` — зелёный.

## Как проверить
1. Открыть сессию с `CallActivity`/`SubProcess`.
2. Убедиться, что при загрузке виден спиннер `Загрузка диаграммы…`.
3. Кликнуть drilldown-стрелку — убедиться, что спиннер появляется, затем открывается child-сессия.
4. Нажать «Назад» — спиннер + возврат к родителю.
5. На родительской диаграмме убедиться в badge обсуждений на элементах с child-сессиями.
6. Breadcrumb не должен перекрывать кнопки «Сохранить сессию» / «Создать версию BPMN».

## Риски
- `BpmnStage.jsx` — большой файл, изменения локализованы.
- Overlay badge зависит от поля `parent_session_id` в списке сессий.

## Статус
- [x] Код
- [x] Тесты
- [x] Сборка
- [ ] Review
- [ ] Merge (только после approve)
