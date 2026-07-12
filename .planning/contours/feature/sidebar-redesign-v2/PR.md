# PR: Sidebar Redesign v2 — референсный сайдбар свойств (reuse из #524 + G1/G2)

**Ветка:** `feature/sidebar-redesign-v2` → `main`
**Base:** main@5aabba98 (после merge PR #523)
**Отношение к #524:** содержит ВСЁ из PR #524 (7 code-коммитов cherry-pick:
compact settings, chips, To-Be builder, live preview, V2 chip filter,
UI refresh) + адаптацию под референс. Если мержится эта ветка — #524 можно
закрыть как subset.
**Контур:** `.planning/contours/feature/sidebar-redesign-v2/`
(REVIEW_REPORT/WORKER_REPORT/STATE)

## Что меняется (поверх #524)

### 1. Индикатор сохранения — в шапку аккордеона «Свойства»
- `SidebarAccordionSection`: новый слот `headerRight` (между заголовком и
  chevron; `stopPropagation` — клик по индикатору не сворачивает секцию).
- Мини-индикатор extension-state (✓ сохранено / ✎ изменения / ⟳ sync / ⚠
  ошибка, tooltip на русском) перенесён из контента вкладки в её шапку —
  виден всегда, даже когда секция свернута.
- Детальный статус с CTA «Повторить» (группа «Вспомогательное») сохранён.

### 2. Reference-набор быстрых свойств
- `DEFAULT_QUICK_PROPERTY_NAMES` = `ee_time, ingredient, ingredient_um,
  ingredient_value, equipment` (было 2 поля).
- Quick-блок «Быстрые свойства» всегда показывает 5 строк (заполненные или
  пустые с быстрым добавлением); те же 5 полей — overlay chips и To-Be pool.
- Превью-карточка data-driven — показывает свойства элемента (напр.
  ingredient/ingredient_um/ingredient_value/equipment) с учётом chips.

### 3. E2E
- Новый `e2e/sidebar-redesign-v2.spec.mjs` (3 сценария): reference quick set
  + chips; индикатор в header (saved → dirty при inline edit); roundtrip
  add → edit → save → reload → delete с проверкой XML-истины.
- Shared helpers вынесены в `e2e/helpers/sidebarRedesignBoot.mjs`
  (спеки больше не дублируют boot-логику).

## Что уже было (reuse, без изменений)

- Process-level properties (PR #523, canvas click = выбор процесса).
- Таблицы «Свойство / Значение / Действие» с inline edit/delete.
- Аккордеон «Дополнительные BPMN-свойства» со счётчиком.
- «Сохранить всё» / «Сбросить» внизу сайдбара.

## Проверка

- Unit: fail-set байт-идентичен baseline main@5aabba98 (35 pre-existing);
  sidebar suites 95/95 green.
- Build: exit 0.
- e2e: `sidebar-redesign-v2.spec.mjs` 3/3 green;
  `property-panel-redesign.spec.mjs` 10/10 green (chromium, workers=1).
- Save pipeline / backend — не тронуты (frontend-only).

## Rollback

- `DEFAULT_QUICK_PROPERTY_NAMES` — одна строка; `headerRight` — опциональный
  слот (без пропса поведение как раньше). localStorage-ключи новые
  (`fpc_prop_panel_groups_v1`) — rollback их просто игнорирует.

## Известные находки (не блокеры)

- Quick-delete auto-save: удаление быстрого свойства сразу шлёт PUT
  (handleQuickDelete → onSaveExtensionState) — задокументировано в e2e.
- Pre-existing render-loop ProcessStage↔AppShell (воспроизводится на чистом
  main) — рекомендуется отдельный PR; e2e фильтрует только это warning.
- Pixel-полировка под референсный скриншот — follow-up, когда скриншот
  будет доступен (G3).
