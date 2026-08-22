# PLAN — fix/breadcrumb-navigation-state

## Цель

Клик по любому breadcrumb item корректно обновляет URL, slice'ает breadcrumb stack,
восстанавливает viewport и focus.

## Проблема

`onBreadcrumbNavigate` в `App.jsx` был `(sid) => openSession(sid)`. При клике:

- URL не менялся (openSession не пишет URL);
- breadcrumb stack не обрезался (оставались "висячие" items справа);
- viewport snapshot не восстанавливался.

## Решение

1. `SubprocessBreadcrumbs.jsx` теперь передаёт в `onNavigate` не только `session_id`,
   но и `index` crumb'а.
2. В `App.jsx` добавлен `handleBreadcrumbNavigate(targetSid, targetIndex)`:
   - slice `subprocessBreadcrumbs` до `index + 1`;
   - восстанавливает viewport snapshot из `parentViewportSnapshotRef` для target session;
   - устанавливает `focusElementId` = crumb.element_id (элемент, из которого зашли глубже);
   - обновляет URL через `pushSessionSelectionToUrl` с `parentSessionId` = предыдущий crumb;
   - открывает target session через `openSession` с `source: "breadcrumb_navigation"`.
3. `pushSessionSelectionToUrl` используется без `replace`, поэтому клик создаёт новую
   history entry. Browser back возвращает к предыдущему (более глубокому) процессу —
   поведение аналогично UI-кнопке Back.

## Изменённые файлы

| Файл | Что изменилось |
|---|---|
| `frontend/src/features/process/SubprocessBreadcrumbs.jsx` | `onNavigate` теперь вызывается с `(session_id, index)`. |
| `frontend/src/App.jsx` | `onBreadcrumbNavigate` заменён на `handleBreadcrumbNavigate`; slice, viewport, focus, URL. |

## Критерии приёмки и проверка

| # | Критерий | Проверка |
|---|---|---|
| 1 | Клик по breadcrumb обновляет URL | В адресной строке `session=<target_session_id>` и `parent=<ancestor_id>` (если не root). |
| 2 | Breadcrumb stack slice'ается | После клика по 2-му crumb из 3 отображается только 2 item'а. |
| 3 | Viewport восстанавливается | Pan/zoom target session совпадает с тем, что был до ухода в deeper sub. |
| 4 | Focus element восстанавливается | Подсвечен элемент, из которого был открыт следующий уровень. |
| 5 | Browser back/forward работают | Back возвращает к предыдущему процессу; forward — к target. |
| 6 | Refresh работает | После F5 открывается target session по URL. |
| 7 | Сборка проходит | `npm run build` OK. |

## Тесты

```bash
cd /root/processmap_v1/frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

Результат: 13/13 PASS, build OK.

## Риски

- Если `parentViewportSnapshotRef` не содержит snapshot для target session (например,
  после reload), viewport не восстановится — будет стандартный fit.
- Если `subprocessBreadcrumbs` рассинхронизирован с `navigation_stack` target session,
  `openSession` перезапишет breadcrumbs из backend, что обычно корректно.

## Статус

Реализация завершена, unit tests и build пройдены. Готово к review.
