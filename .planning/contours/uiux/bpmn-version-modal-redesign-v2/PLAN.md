# План доработки модалки "История версий BPMN"

**Контур:** `uiux/bpmn-version-modal-redesign-v2`  
**Worktree:** `/opt/processmap-test/.worktrees/uiux-bpmn-version-modal-redesign-v2`  
**Цель:** Перевести модалку истории версий BPMN на визуальный, компактный, информативный интерфейс согласно требованиям.

---

## 1. Данные и состояние (ProcessStage.jsx)

- Сохранять в `versionsListRaw` **все** версии, полученные от API (meaningful + technical + unknown).
- Ввести `showTechnicalVersions` (boolean, default false) и `isAdmin` (из `useAuth().user?.is_admin`).
- Формировать отображаемый `versionsList`:
  - Для обычного пользователя — только `isMeaningfulRevision === true`.
  - Для admin при `showTechnicalVersions === true` — все, meaningful первыми, затем technical/unknown по `ts` DESC.
- Нумерация:
  - Meaningful-версии получают последовательную user-facing нумерацию (1, 2, 3… сверху вниз) через `applyUserFacingRevisionNumbers`.
  - Технические версии не получают user-facing номер; в UI отображается только технический `technicalRevisionNumber` (muted, в скобках) + reasonLabel.
- Размер:
  - Если `len` известен — показывать KB.
  - Если `len === 0` и XML не загружен — показывать `—` вместо `0 B`.
- Кэширование: при переключении версий не запрашивать XML повторно (уже реализовано через `ensureBpmnVersionXml` + `hasXml`).
- `onSaveSession`: триггер ручного сохранения / публикации версии (reuse existing manual save flow).

## 2. Список версий (BpmnVersionList.jsx)

- Удалить весь пояснительный текст.
- Compact timeline: вертикальная линия с точками, карточки версий.
- Карточка версии:
  - Крупный user-facing номер (`Версия N`).
  - Бейдж: `текущая` / `последняя` / `устаревшая`.
  - Дата/время: `26.06.2026, 14:35`.
  - Аватар + имя автора.
  - Комментарий (если есть).
  - Diff summary (1 строка): `+3 задачи, −1 gateway`.
  - Хэш: 8 символов, копируемый по клику.
  - Размер: KB или `—`.
- Inline actions убрать из карточки (перенести в футер).
- Admin toggle "Показать технические версии" (только если `isAdmin`).
- Технические версии: muted цвет, иконка шестерёнки, бейдж "Техническая", причина (`auto-save`, `manual_save`, `export_regenerate`...).
- Empty state: "История версий пуста. Сохраните сессию, чтобы создать первую версию." + кнопка "Сохранить сейчас" (если `onSaveSession` передан).

## 3. Предпросмотр (BpmnVersionPreview.jsx)

- Уже использует `NavigatedViewer`.
- Убедиться, что при выборе версии слева XML загружается и рендерится автоматически (обеспечивается `previewSnapshotVersion`).
- Добавить skeleton/placeholder при загрузке > 3 сек.
- Сообщение об ошибке: "Не удалось загрузить версию. XML повреждён или невалиден." + кнопка "Скачать XML для диагностики".
- XML toggle оформить как текстовую ссылку в заголовке.

## 4. Футер действий (BpmnVersionActions.jsx)

- Primary: "Восстановить эту версию" (disabled если текущая).
- Secondary outline: "Скачать .bpmn", "Сравнить с текущей" (disabled если текущая).
- Tertiary: "Предпросмотр XML" — текстовая ссылка.
- Остальное: "Обновить", "Сравнить А/В" (disabled если < 2 версий, с tooltip), "Закрыть".

## 5. Layout модалки (ProcessDialogs.jsx)

- `min-width: 900px` на десктопе.
- Сетка: слева 30% (список), справа 70% (preview).
- Mobile: bottom sheet (responsive через Tailwind).
- Передать `onSaveSession` в `BpmnVersionList`.
- Передать `showTechnical`, `isAdmin`, `onToggleTechnical` в `BpmnVersionList`.

## 6. Diff (BpmnVersionDiffOverlay.jsx + semanticDiff.js)

- Добавить чекбокс "Показывать позиционные изменения" (default off).
- В `semanticDiff.js` добавить `buildBpmnPositionDiff(previousXml, nextXml)`:
  - Парсит `bpmndi:BPMNShape` / `bpmndi:BPMNEdge`.
  - Сравнивает `x, y, width, height` и waypoints по `bpmnElement` id.
  - Возвращает `{ moved: [], resized: [], waypointsChanged: [] }`.
- В diff overlay:
  - Semantic counts: `+N −N ΔN`.
  - Position changes count отдельно (если чекбокс on).
  - Список позиционных изменений отдельной секцией.
- Визуально оставить текущую схему (minimaps + main diagram с бейджами), добавить side-by-side toggle по желанию (out of scope minimal).

## 7. Тестирование

- `npm run build` — без ошибок.
- Playwright: открыть модалку, выбрать версию, проверить рендер preview, проверить кнопки, проверить admin toggle (если возможно).
- Вручную проверить: empty state, 1 версия (disabled diff), ошибка XML, восстановление, скачивание.

## 8. Что не трогаем

- Backend endpoints и логику создания версий.
- Логику восстановления версии (только UI).
- API контракты.
