# RUNTIME_NAVIGATION — perf/process-stage-baseline-jank-v1

## Целевая диаграмма

- **Проект:** wewe
- **Сессия:** «Описание процессов Долгопрудный»
- **URL (пример):** `http://clearvestnic.ru:5180/?cb=<timestamp>`

## Шаги навигации

1. Открыть `http://clearvestnic.ru:5180/?cb=<timestamp>` в fresh browser context.
2. Дождаться загрузки App (login если нужно).
3. В списке проектов найти **wewe**.
4. В списке сессий найти **«Описание процессов Долгопрудный»**.
5. Открыть сессию — по умолчанию активна вкладка **Diagram** (BPMN).
6. Убедиться, что режим **Modeler** (палитра видна).
7. Выключить overlays: кнопка **«Слои OFF»** или эквивалент.
8. Подтвердить отсутствие property overlays:
   ```js
   document.querySelectorAll('.fpcPropertyOverlay').length === 0
   ```
9. Подтвердить large diagram:
   ```js
   document.querySelectorAll('svg *').length // ~2400
   document.querySelectorAll('.djs-container').length // 1
   ```

## Проверки версии

- Найти строку версии внизу страницы (footer / bottom row).
- Должна содержать: `Версия v1.0.130` (или v1.0.131 после фикса).
- Убедиться, что маркер версии **не** наложен на canvas:
  ```js
  document.querySelectorAll('[data-testid="diagram-runtime-version-badge"]').length === 0
  ```
- Проверить `build-info.json`:
  ```js
  await fetch('/build-info.json').then(r => r.json())
  // ожидается: contourId === "perf/process-stage-baseline-jank-v1"
  ```
- Проверить `window.__PROCESSMAP_BUILD_INFO__`:
  ```js
  window.__PROCESSMAP_BUILD_INFO__
  ```

## Тестовые сценарии

### B. Idle 10s baseline
- Не производить действий 10 секунд.
- Записать PerformanceObserver long tasks.

### C. Real canvas drag quick/natural
- Нажать на пустую область canvas.
- Провести плавный drag ≈300–500px.
- Отпустить.
- 3 попытки.

### D. Real canvas drag stepped/stress
- Нажать и медленно вести с паузами.
- Или быстрое дрожание указателя.
- 3 попытки.

### E. Real element drag
- Выбрать BPMN-элемент (например, Task).
- Перетащить на новую позицию.
- 3 попытки.
- Проверить Network: нет PUT/PATCH.

### F. Tab switch
- Переключиться на **Analysis**.
- Вернуться на **Diagram**.
- Замерить время до появления usable canvas.
- Повторить через **XML** → **Diagram**.
