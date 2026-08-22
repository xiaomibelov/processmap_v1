# AUDIT — Ellipsis (⋯) Menu Redesign

## Проблема
Меню действий BPMN-редактора (⋯) перегружено: режимы, файл, версии, контекст, шаблоны, редкие действия в одной длинной панели. Нужен редизайн для компактности и usability.

## Где рендерится
- **Триггер**: `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx:228-238` — кнопка `⋯`, `data-testid="diagram-toolbar-overflow-toggle"`.
- **Панель**: `frontend/src/features/process/stage/ui/ProcessPanels.jsx:211-461` — `diagramToolbarOverlay`, условно рендерится при `toolbarMenuOpen`.
- **Состояние**: `useProcessStagePanelState.js` (`toolbarMenuOpen`).
- **Actions**: `useProcessStageActionsController.js`.
- **Внешний клик / Escape**: `useDiagramActionPopovers.js`.

## Текущие пункты меню
### Режимы
- `Normal`, `Interview`, `Quality`, `Coverage` — переключение режима диаграммы (`applyDiagramMode`).
- `Команды` — toggle AI command mode.

### Файл и версии
- Импорт BPMN (`openImportDialog`).
- Экспорт BPMN (`exportBpmn`).
- Версии (`openVersionsModal`).

### Контекст
- Показывается только при выбранном элементе:
  - Вставить между (`openInsertBetweenModal`).
  - Открыть заметки (`onOpenElementNotes`).
  - Сгенерировать вопросы (`generateAiQuestionsForSelectedElement`).
- Иначе placeholder.

### Шаблоны
- Toggle "Шаблоны: ON/OFF".
- До 3 suggested templates inline.

### Командный режим
- Появляется, если `commandModeEnabled` — input + history.

### Редкие действия
- Сброс (`runToolbarReset`).
- Очистить (`runToolbarClear`).

## Стили и позиционирование
- Overlay: `absolute right-2 top-[calc(100%+8px)] z-[70] w-[min(520px,calc(100vw-48px))] max-h-[68vh]`.
- Секции: `diagramToolbarOverlaySection` с border и title uppercase.
- Кнопки: `flex-wrap gap-1.5`, text-only.
- Trigger: `secondaryBtn h-8 w-9`.

## Связанные меню
- **TopBar** — project/session/org selectors, account (z-[130]).
- **Canvas action-bar overflow** — `ProcessStageDiagramControls` дублирует часть действий (templates, notes, AI, insert between).
- **Context menu** — right-click на элементе.
- **Versions modal** — `ProcessDialogs.jsx`.
- **Templates bottom menu** — `TemplatesBottomMenu.jsx` (z-[160]).

## UX-проблемы
1. **Перегрузка** — до 7+ секций, command mode увеличивает высоту.
2. **Отсутствие иконок** — только текст, плохая сканируемость.
3. **Нет иерархии** — все действия на одном уровне.
4. **Дублирование** с canvas action-bar overflow.
5. **Контекстная секция исчезает**, когда ничего не выбрано; placeholder не заменяет действия.
6. **Нет keyboard navigation** — только Tab, фокус не возвращается на trigger.
7. **z-index**: topbar menus могут перекрывать ellipsis overlay.
8. **Мобильные**: dropdown прижат к краю, нет bottom-sheet.

## Релевантные файлы
- `frontend/src/features/process/stage/ui/ProcessStageHeader.jsx`
- `frontend/src/features/process/stage/ui/ProcessPanels.jsx`
- `frontend/src/features/process/stage/orchestration/state/useProcessStagePanelState.js`
- `frontend/src/features/process/stage/controllers/useProcessStageActionsController.js`
- `frontend/src/features/process/stage/hooks/useDiagramActionPopovers.js`
- `frontend/src/styles/tailwind.css` (~2475–2565)
- `frontend/src/features/process/stage/ui/ProcessStageDiagramControls.jsx`
