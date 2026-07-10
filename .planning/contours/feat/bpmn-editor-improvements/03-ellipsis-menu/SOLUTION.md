# SOLUTION — Ellipsis Menu Redesign

## Цель
Сделать меню `⋯` компактным, быстро считываемым и удобным на десктопе и мобильных.

## Предлагаемый подход
### Группировка и иконки
Превратить длинную панель в **иерархическое меню** с иконками (16×16, reuse `diagramActionBtnIcon`):

1. **Режимы** — compact segmented control остаётся в header center на десктопе; в меню только переполнение (если не влезает).
2. **Файл ▾** — подменю:
   - Импорт BPMN
   - Экспорт BPMN
3. **Версии** — top-level item с иконкой часов; открывает существующий modal.
4. **Контекст ▾** — только когда есть выбранный элемент:
   - Вставить между
   - Открыть заметки
   - Сгенерировать вопросы
5. **Шаблоны** — одна кнопка, открывающая `TemplatesBottomMenu`; toggle убираем из ellipsis (есть в canvas action bar).
6. **AI Команды** — маленький toggle с иконкой; поле ввода не показывать в меню, только переключение режима.
7. **Редкие** — внизу, приглушённые:
   - Сброс
   - Очистить

### Подменю / аккордеон
- Десктоп: hover/click раскрывает подменю справа (cascading menu) или секции-аккордеоны.
- Мобиль: bottom sheet с секциями.

### Keyboard shortcuts
- Показывать shortcut рядом с item:
  - Open menu: `Alt + M`
  - Versions: `Ctrl/Cmd + Shift + V`
  - Import: `Ctrl/Cmd + Shift + I`
  - Export: `Ctrl/Cmd + Shift + E`
- Реализовать arrow-key navigation и возврат фокуса на trigger.

### Accessibility
- `role="menu"`, `role="menuitem"`, `aria-disabled` вместо `disabled`.
- Trap focus while open.

### Consolidation
- Убрать дубли из canvas action-bar overflow: оставить там только canvas-specific действия (overlays, playback, execution plan); глобальные (versions, templates, file) — в header ellipsis.
- Поднять z-index ellipsis overlay выше TopBar dropdown или закрывать TopBar dropdowns на открытие ellipsis.

## Минимальные изменения
- `frontend/src/features/process/stage/ui/ProcessPanels.jsx` — полностью переработать разметку меню.
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx` — возможно, перенести режимы в center slot.
- `frontend/src/styles/tailwind.css` — новые utility-классы для menu/submenu.
- `frontend/src/features/process/stage/hooks/useDiagramActionPopovers.js` — focus trapping и keyboard nav.
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx` — удалить дублирующие пункты.
