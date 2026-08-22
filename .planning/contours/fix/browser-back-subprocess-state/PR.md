# PR — fix/browser-back-subprocess-state

## Что сделано

Исправлено поведение browser back при возврате из subprocess:
- восстанавливается breadcrumb stack;
- восстанавливается viewport snapshot (pan/zoom);
- восстанавливается focus element в родительском процессе.

## Изменения

- `frontend/src/App.jsx`: `popstate` handler теперь вызывает `returnToParent` с
  `replaceHistory: true` вместо `openSession(parentSid)`.
- `frontend/src/features/process/bpmn/stage/navigation/useSubprocessNavigation.js`:
  `returnToParent` принимает `options` (`replaceHistory`, `skipHistoryPush`, `source`).
- `frontend/src/app/useSessionRouteOrchestration.js`: `pushSessionSelectionToUrl`
  поддерживает `options.replace`.
- `frontend/src/app/sessionRouteOrchestration.test.mjs`: добавлен unit test на replace.

## Как проверить

1. Открыть процесс с subprocess.
2. Кликнуть «Перейти в подпроцесс».
3. Нажать browser back.
4. Убедиться, что:
   - breadcrumb bar показывает только родительский процесс;
   - viewport (pan/zoom) совпадает с тем, что был до перехода;
   - подсвечен элемент, из которого зашли в subprocess.
5. Browser forward возвращает в subprocess.

## Тесты

```bash
cd frontend
node --test src/app/sessionRouteOrchestration.test.mjs
npm run build
```

- Unit tests: 13/13 PASS
- Build: OK

## Риски

- Возможны edge cases при одновременном изменении project в URL; добавлен guard
  `sameProjectForReturn`.
- `apiReturnToParent` — синхронный API вызов при popstate; при медленной сети
  возможна задержка.

## Merge / Deploy

**Не merge'ить и не деплоить без explicit approve.**
