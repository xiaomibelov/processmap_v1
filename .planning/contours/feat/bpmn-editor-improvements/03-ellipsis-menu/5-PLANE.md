# 5-PLANE — Ellipsis Menu Redesign

## 1. UX Plane
- **Сейчас**: длинная панель с 7+ секциями, text-only кнопки, дублирование.
- **Нужно**: компактное меню с иконками, группировкой, подменю, keyboard shortcuts, фокус-менеджментом.
- **Принцип**: глобальные действия сессии — в header ellipsis; действия выбранного элемента — в context menu / canvas action bar.

## 2. Data Plane
- Данные меню берутся из пропсов/стейта `ProcessStage`: `hasSession`, `isBpmnTab`, `selectedElementId`, `commandModeEnabled`, `templatesEnabled`, `suggestedTemplates`.
- Никаких новых backend-данных не требуется.

## 3. Logic Plane
- Состояние `toolbarMenuOpen` уже есть.
- Нужно добавить подменю/аккордеон состояния (например, `openSubmenu: null | 'file' | 'context'`).
- Обработчики уже существуют в `useProcessStageActionsController`.

## 4. Integration Plane
- Возможные конфликты z-index с TopBar menus — нужно поднять overlay выше или закрывать TopBar menus при открытии ellipsis.
- Canvas action-bar overflow дублирует действия; нужно провести аудит и оставить canonical entry points.
- Модалы (versions, import, templates) вызываются из меню; изменения не затрагивают их внутренности.

## 5. Accessibility / Mobile Plane
- Нужны `role="menu"`, `role="menuitem"`, `aria-expanded`, стрелки, Esc, возврат фокуса.
- На мобильных — bottom sheet вместо dropdown.
- Touch targets ≥ 44 px.
