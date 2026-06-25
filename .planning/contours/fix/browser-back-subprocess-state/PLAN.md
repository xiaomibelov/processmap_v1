# PLAN — fix/browser-back-subprocess-state

## Цель

Browser back восстанавливает breadcrumbs и viewport при возврате из sub-процесса
в родительский процесс.

## Проблема

`popstate` handler в `App.jsx` открывал parent напрямую через `openSession(parentSid)`:

- не обновлял `subprocessBreadcrumbs`;
- не применял сохранённый `parentViewportSnapshotRef`;
- не восстанавливал `focusElementId`.

## Решение

Реплицировать логику `returnToParent` внутри `popstate` handler:

1. Определить, что текущая сессия — child (`draft.parent_session_id`).
2. Вызвать `returnToParent(currentSessionId, { replaceHistory: true })` вместо
   `openSession(parentSid)`.
3. `returnToParent` делает `POST /api/sessions/{child}/return`, восстанавливает
   viewport snapshot, обрезает breadcrumb, устанавливает focus и открывает parent
   session с cached draft.
4. `replaceHistory: true` заменяет текущую URL-запись (после `popstate`) вместо
   push, чтобы не плодить лишние history entries.

## Изменённые файлы

| Файл | Что изменилось |
|---|---|
| `frontend/src/App.jsx` | popstate handler теперь вызывает `returnToParent` для child→parent перехода; добавлены `draftRef` и `returnToParentRef`; guard same project. |
| `frontend/src/features/process/bpmn/stage/navigation/useSubprocessNavigation.js` | `returnToParent(sessionIdArg, options)` — поддержка `replaceHistory`, `skipHistoryPush`, `source`. |
| `frontend/src/app/useSessionRouteOrchestration.js` | `pushSessionSelectionToUrl(..., options)` — поддержка `options.replace`. |
| `frontend/src/app/sessionRouteOrchestration.test.mjs` | Добавлен тест на `replace` опцию. |

## Viewport snapshot

Снапшот уже сохраняется в `navigateToSubprocess` в `parentViewportSnapshotRef`
keyed by parent session id. `returnToParent` читает его оттуда и передаёт в
`setRestoreViewportSnapshot`. Дополнительных изменений не потребовалось.

## Критерии приёмки и проверка

| # | Критерий | Проверка |
|---|---|---|
| 1 | Browser back восстанавливает breadcrumbs | Визуально / e2e: открыть sub → back → breadcrumb bar показывает только parent. |
| 2 | Browser back восстанавливает viewport | Визуально: pan/zoom parent до перехода совпадает с после back. |
| 3 | Browser back восстанавливает focus element | Подсветка оранжевой рамкой на элементе, из которого зашли в sub. |
| 4 | Forward возвращает в sub-процесс | Browser forward открывает child; breadcrumbs rebuild из `navigation_stack`. |
| 5 | Unit test проходит | `node --test src/app/sessionRouteOrchestration.test.mjs` 13/13 PASS. |
| 6 | Сборка проходит | `npm run build` успешен. |

## Тесты

```bash
cd /root/processmap_v1/frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

Результат: 13/13 PASS, build OK.

## Риски и ограничения

- Если пользователь делает browser back на URL другого проекта без сессии,
  guard `sameProjectForReturn` предотвращает ложный возврат к parent.
- `returnToParent` делает API-запрос; при медленной сети может быть задержка.
  Рассмотреть кеширование parent session для мгновенного отклика.
- Если child session удалена, `apiReturnToParent` вернёт 404; поведение fallback
  остаётся как раньше.

## Статус

Реализация завершена, unit tests и build пройдены. Готово к review.
