# Analytics IA preservation rules

- contour: `uiux/product-actions-registry-noise-cleanup-single-container-v1`
- run_id: `20260518T164643Z-83747`
- источник: PLAN.md §2; UX_SPEC_IMPLEMENTATION_MAP.md §B; OBSIDIAN_CONTEXT_USED.md (контуры IA-rework и analytics-hub).

## 1. Канонический IA

```
Аналитика
├── Реестр действий          ← целевая страница контура
├── Реестр свойств
└── Дашборды
```

- [ ] Раздел верхнего уровня **«Аналитика»** виден в навигации (sidebar / top nav).
- [ ] Внутри Аналитики есть три суб-пункта: «Реестр действий», «Реестр свойств», «Дашборды».
- [ ] Переход «Аналитика → Реестр действий с продуктом» открывает целевую страницу.
- [ ] Кнопка «Вернуться» на странице реестра возвращает в Analytics Hub (не в корневой dashboard / explorer / workspace).

## 2. Жёсткие запреты

- [ ] **Запрещено удалять** раздел «Аналитика» из навигации.
- [ ] **Запрещено обходить** Analytics Hub: нельзя добавлять прямой роут / прямую ссылку из глобального shell (TopBar / sidebar / WorkspaceExplorer) непосредственно в «Реестр действий», минуя Аналитику.
- [ ] **Запрещено заменять** «Аналитику» на «Реестр действий» на верхнем уровне (нельзя переименовать раздел или подменить landing).
- [ ] **Запрещено повышать** «Реестр действий», «Реестр свойств» или «Дашборды» на верхний уровень навигации (они должны оставаться вложенными в «Аналитику»).
- [ ] **Запрещено вводить** альтернативные именования раздела («Registry», «Регистр», «Действия» и т.п.) — текст ровно `Аналитика` / `Реестр действий с продуктом`.

## 3. Файлы DO-NOT-TOUCH (контролируем по diff)

- [ ] `frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx` — Analytics shell. Любые изменения этого файла в рамках контура — запрет.
- [ ] `frontend/src/components/AppShell.jsx` — глобальный shell.
- [ ] `frontend/src/components/TopBar.jsx` — top-level навигация.
- [ ] `frontend/src/features/explorer/WorkspaceExplorer.jsx` — workspace navigation.
- [ ] Связанные роутинг-файлы: `frontend/src/app/processMapRouteModel.js` и любые маршруты, ведущие в `Analytics → ProductActionsRegistryPage`.

Команда контроля:

```bash
git diff origin/main -- \
  frontend/src/components/process/analysis/ProcessAnalyticsHub.jsx \
  frontend/src/components/AppShell.jsx \
  frontend/src/components/TopBar.jsx \
  frontend/src/features/explorer/WorkspaceExplorer.jsx \
  frontend/src/app/processMapRouteModel.js
# Должна быть пустая разница, либо строго bounded (только импорты роута, если они менялись для связи Hub → Registry).
```

## 4. Runtime-проверки IA

- [ ] В DOM присутствует элемент навигации с текстом `Аналитика` (top nav / sidebar).
- [ ] Раскрытие/наведение на «Аналитика» показывает три подпункта: «Реестр действий», «Реестр свойств», «Дашборды».
- [ ] URL/роут страницы реестра остаётся вложенным в Analytics-контекст (например, содержит `/analytics/`/`/analysis/` сегмент или эквивалентный по реализации).
- [ ] При прямом переходе по URL реестра top-nav по-прежнему подсвечивает «Аналитика» как активный родительский раздел.
- [ ] Кликом по «Вернуться» происходит навигация в Analytics Hub (а не в `/`, `/dashboard`, `/explorer`).

## 5. Negative tests (что обязательно НЕ должно произойти)

- [ ] В TopBar/Sidebar **нет** прямого пункта `Реестр действий` верхнего уровня.
- [ ] В роут-модели **нет** «короткого» алиаса `/registry` или `/product-actions`, ведущего на страницу в обход Hub-а.
- [ ] В `ProcessAnalyticsHub.jsx` **не** удалены ссылки на «Реестр свойств» и «Дашборды».
- [ ] В Analytics Hub **не** удалены plate/линки трёх под-разделов.

## 6. Связанные документы

- `UX_ACCEPTANCE_CRITERIA_FROM_SPEC.md` §16 — runtime-проверка IA.
- `FORBIDDEN_VISUAL_PATTERNS.md` F15 — запрет правок Hub / обхода Аналитики.
- `RUNTIME_PROOF_CHECKLIST.md` блок C — IA / Analytics preservation.
