# DIAGNOSIS: не открывается меню «···» у строки типа «Проект»

## Симптом

В табличном представлении WorkspaceExplorer кнопка «···» (kebab) открывает контекстное меню у строк «Папка», «Сессия» и «Раздел», но у строки «Проект» меню не появляется.

## Root cause

### 1. Первичная причина в legacy-ветке (где воспроизводился баг)

В локальной dev-ветке `uiux/bpmn-session-upload-v1` (p0-work) строка проекта рендерила hover-only CTA «Открыть проект» внутри ячейки названия / поверх зоны действий. Этот span/overlay перехватывал pointer events и физически перекрывал кнопку «···»:

- `ProjectRow` содержал `<span>Открыть проект</span>` с `group-hover:opacity-100`;
- overlay располагался в том же table-cell, что и kebab, без изоляции `pointer-events-none`;
- клик по визуальной области «···» попадал на overlay, а не на `<button>`.

### 2. Причина в актуальном baseline `origin/main`

В `origin/main` первичная проблема уже устранена коммитом `uiux/explorer-adaptive-v1`: CTA «Открыть проект» вынесен в отдельный `AppRouteLink` внутри action-cell, hover-overlay убран, kebab кликабелен.

Однако остаётся **вторичный дефект позиционирования**, который при определённых layout-условиях (отсутствие positioned ancestor у ячейки действий) делал меню нестабильным или невидимым:

- `FolderRow` задаёт action-cell как `<td className="... w-8 text-right relative">`;
- `ProjectRow` задаёт action-cell как `<td className="... text-right ${compact ? 'w-8' : 'w-[88px]'}">` без `relative`;
- `ContextMenu` рендерится `absolute right-0 top-full` внутри ячейки.

Без `relative` на `<td>` контекстное меню позиционируется относительно ближайшего positioned ancestor выше по дереву, что нарушает ожидаемое поведение и может привести к тому, что меню улетает за границы строки / не кликается.

### Отличие ветки «Проект» от «Папка/Сессия/Раздел»

| Аспект | FolderRow / Section | ProjectRow |
|--------|---------------------|------------|
| Action-cell класс | `... w-8 text-right relative` | `... text-right w-8 / w-[88px]` (нет `relative`) |
| CTA в action-cell | только kebab | kebab + «Открыть проект» AppRouteLink |
| Hover-overlay | нет | в legacy-ветке — перекрывающий span; в main — убран |
| ContextMenu anchor | `<td relative>` | `<td static>` (до патча) |

## 5-plane proof

1. **code** — патч в `frontend/src/features/explorer/WorkspaceExplorer.jsx:1842`, добавляющий `relative` к `<td>` действий `ProjectRow`.
2. **workspace** — worktree `/Users/mac/agents_place/kimi_PM/p0-work-worktrees/fix-project-kebab-menu`, ветка `fix/project-kebab-menu`, HEAD `06e0f093`, от `origin/main`.
3. **DB** — не затронута; изменение только в UI-рендеринге.
4. **env/compose** — dev-сервер запущен на `http://127.0.0.1:5178` с прокси на API `http://127.0.0.1:8011`.
5. **serving mode** — Playwright e2e против локального dev-сервера подтверждает: клик по «···» у строки проекта открывает меню.

## Ограничения

- Патч не меняет поведение меню у папок/сессий/разделов.
- Патч не рефакторит соседние компоненты.
- Первичная причина (hover-overlay) в `origin/main` уже исправлена; данный фикс устраняет оставшийся structural дефект позиционирования и предотвращает регрессию.
