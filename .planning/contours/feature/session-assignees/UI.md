# UI — feature/session-assignees

## Пользовательский сценарий

1. Пользователь открывает проект в Process Map.
2. В списке сессий видит колонку **«Исполнители»**.
3. Нажимает кнопку «...» у сессии.
4. Выбирает **«Назначить исполнителя»** или **«Изменить исполнителей»**.
5. В модалке выбирает одного или нескольких пользователей организации (поиск по имени).
6. Нажимает **«Сохранить»**.
7. Список сессий обновляется: показываются назначенные (аватарки/имена), при более чем 2 — «+N».

## Компоненты

### `SessionAssigneesDialog`

Новый компонент в `frontend/src/features/explorer/WorkspaceExplorer.jsx`.

- **Props:**
  - `session` — объект сессии.
  - `users` — список назначаемых пользователей (из `apiListOrgAssignableUsers`).
  - `loadingUsers`, `usersError` — состояния загрузки.
  - `initialUserIds` — текущие assignees сессии.
  - `onClose` — закрыть диалог.
  - `onSave(userIds)` — сохранить выбранных (`userIds: string[]`).

- **Логика:**
  - Инициализирует выбранные из `initialUserIds`.
  - Поле поиска по имени/email/должности (`filterExplorerAssignableUsers`).
  - Чекбокс-список пользователей.
  - Кнопки: **«Отмена»**, **«Сохранить»**. Снятие всех — через снятие всех чекбоксов.
  - Во время сохранения — disabled + спиннер.

### `SessionAssigneesCell`

- Отображает до 2 assignees аватарками + именем.
- При >2 — «+N» и tooltip со всеми.
- При 0 — «Не назначен».

### `SessionRow` (изменения)

- Добавить проп `canAssignAssignees`.
- Callback `onAssignAssignees(session)`.
- В `ContextMenu` добавить пункт:
  ```jsx
  ...(canAssignAssignees ? [{
    label: getSessionAssigneesActionLabel(session),
    icon: <IcoEdit />,
    action: () => onAssignAssignees?.(session),
  }] : [])
  ```
- Отображение assignees в колонке списка через `SessionAssigneesCell`.

### `ProjectPane` (изменения)

- Передавать `canAssignAssignees={!!permissions?.canAssignSessionAssignees}` и `onAssignAssignees={handleOpenSessionAssignees}` в `SessionRow`/`SessionTreeRows`.
- Добавить колонку «Исполнители» в таблицу сессий между «Owner» и «DoD».
- State: `sessionAssigneesDialog`, `sessionAssigneesUsersState`, `sessionAssigneesCurrentIds`.
- Effect загружает `apiListOrgAssignableUsers(activeOrgId)` и `apiGetSessionAssignees(sessionId)` при открытии диалога.
- Save handler вызывает `apiReplaceSessionAssignees`, патчит локальное состояние и перезагружает страницу проекта.

### `SessionTreeRows` (изменения)

- Прокидывать `canAssignAssignees`, `showAssigneesColumn`, `onAssignAssignees` вложенным `SessionRow`.

## Состояния загрузки пользователей

Для модалки сессии загружаются назначаемые пользователи отдельным эффектом (`sessionAssigneesUsersState`), аналогично `assigneeMembersState` для папок/проектов.

## Обработка ошибок

- Ошибка сохранения — показывать внутри модалки красным текстом.
- 403 — редкий случай (кнопка доступна только тем, у кого есть права), но обработать как «Недостаточно прав».

## Адаптив

- Колонка «Исполнители» скрывается на `<md` breakpoint вместе с «Owner» (`hidden md:table-cell`).
- В `ProjectPane` пока нет адаптивного сокрытия по ширине контейнера; оставляем фиксированную минимальную ширину и `truncate`.

## i18n

- Новые строки на русском:
  - «Назначить исполнителя» / «Изменить исполнителей»
  - «Исполнители схемы»
  - «Исполнители»
  - «Не назначен»
  - «Найти пользователя»
  - «Сохранить» / «Отмена»
  - «Выбрано: N» / «Не выбрано ни одного исполнителя"
