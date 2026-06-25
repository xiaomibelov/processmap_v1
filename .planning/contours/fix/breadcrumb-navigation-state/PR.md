# PR — fix/breadcrumb-navigation-state

## Что сделано

Исправлено поведение клика по breadcrumb item в subprocess navigation:
- URL обновляется на `session=<target_id>&parent=<ancestor_id>&focus=<element_id>`;
- breadcrumb stack обрезается до выбранного уровня;
- восстанавливается viewport snapshot для target session;
- восстанавливается focus element (элемент, из которого был открыт следующий уровень).

## Изменения

- `frontend/src/features/process/SubprocessBreadcrumbs.jsx`: `onNavigate` передаёт
  `(session_id, index)`.
- `frontend/src/App.jsx`: `handleBreadcrumbNavigate` slice'ает stack, читает snapshot,
  обновляет URL и открывает target session.

## Как проверить

1. Открыть процесс с вложенными subprocess (минимум 2 уровня).
2. Перейти вглубь, чтобы breadcrumbs показали 3 item'а.
3. Кликнуть по среднему breadcrumb.
4. Убедиться:
   - breadcrumbs показывают только 2 item'а;
   - URL содержит `session=<id среднего>`;
   - viewport совпадает с тем, что был до ухода глубже;
   - подсвечен элемент, из которого открывали следующий уровень.
5. Browser back возвращает к предыдущему (глубокому) процессу.
6. Refresh открывает тот же процесс, что в URL.

## Тесты

```bash
cd frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

- Unit tests: 13/13 PASS
- Build: OK

## Риски

- При отсутствии snapshot viewport просто fit'ится.
- `openSession` перезапишет breadcrumbs из backend `navigation_stack`, что обычно
  корректно.

## Merge / Deploy

**Не merge'ить и не деплоить без explicit approve.**
