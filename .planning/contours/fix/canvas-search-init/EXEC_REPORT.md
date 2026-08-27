# EXEC REPORT: Fix инициализации поиска на Canvas

**Контур:** `fix/canvas-search-init`  
**Тип:** `fix`  
**Роль:** Agent 2 (Executor)  
**Branch:** `fix/canvas-search-init`  
**Baseline:** `origin/main` (`037ae13b608c71512606761e65e5b9674d8c9494`)

---

## Что сделано

### Баг
При клике на поле поиска в Canvas панель открывалась, но список элементов/свойств оставался пустым («Все элементы (0)» / «Ничего не найдено»). Данные появлялись только после принудительного переключения вкладки.

### Причина
Предзагрузка elements/properties в `useDiagramSearchController.js` срабатывала один раз при изменении `diagramXml` / `mutationVersion`. Если `bpmnRef.current` в этот момент ещё не был полностью готов (canvas не отрисовал элементы), `listSearchableElements()` возвращал пустой массив, и повторной загрузки при открытии поиска не происходило.

### Исправление
1. **`useDiagramSearchController.js`**: добавлен `refreshActiveSource` — явный перезапрос текущего data-source (`elements` или `properties`) по текущей вкладке.
2. **`diagramSearchInlineInput.jsx`**: при `focus` на input и при `click` на trigger (handleExpand) вызывается `onRefresh()`, что принудительно перезагружает данные в момент открытия панели.
3. **Wiring**: `refreshActiveSource` проведён через `ProcessStage.jsx` → `ProcessStageDiagramControls.jsx` → `DiagramSearchInlineInput`.

### Тесты
- `searchContract.test.mjs`: добавлен контрактный тест на wiring `onRefresh`, `onFocus` и `refreshActiveSource`.
- `useDiagramSearchController.test.mjs`: добавлен поведенческий тест, проверяющий, что `refreshActiveSource` перезагружает данные текущего режима.

---

## Результаты проверок

- **Unit-тесты:** `41/41` passed.
  - `searchContract.test.mjs`
  - `useDiagramSearchController.test.mjs`
- **Production build:** `npm run build` — успешно (`✓ built in 37.85s`).
- **Регрессия:** не обнаружена.

---

## Git-proof

```text
branch: fix/canvas-search-init
HEAD:   037ae13b608c71512606761e65e5b9674d8c9494 (origin/main baseline)
status: 6 changed files, 116 insertions(+)
files:
  M frontend/src/components/ProcessStage.jsx
  M frontend/src/features/process/stage/search/diagramSearchInlineInput.jsx
  M frontend/src/features/process/stage/search/searchContract.test.mjs
  M frontend/src/features/process/stage/search/useDiagramSearchController.js
  M frontend/src/features/process/stage/search/useDiagramSearchController.test.mjs
  M frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx
  ?? .planning/contours/fix/canvas-search-init/
```

---

## Риски / ограничения

1. **Unrelated untracked файлы** в рабочем дереве (остатки предыдущих контуров). Они не входят в diff и не будут в коммите.
2. **Runtime-проверка** ограничена unit-тестами и production build. Для ручной проверки в браузере нужен изолированный dev-стек (canonical стек занимает порты 5177/8011).

---

## Критерии приёмки

- [x] Клик на поле поиска теперь явно перезагружает данные текущей вкладки.
- [x] Instant-список элементов/свойств показывается при фокусе.
- [x] Переключение вкладок продолжает работать как клиентский фильтр.
- [x] «Расширенный поиск» (уже в main) остаётся доступен.
- [x] Нет регрессии существующего поиска.
